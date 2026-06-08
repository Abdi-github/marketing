// Anthropic Claude adapter for IAIProvider.
// ONLY file in the codebase allowed to import @anthropic-ai/sdk.
// See docs/ADRs/0003-ai-provider-abstraction.md.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@marketing/shared";
import { BudgetExceededError } from "../../interface";
import type {
  CallOpts,
  CompletionInput,
  CompletionOutput,
  EmbedInput,
  EmbedOutput,
  IAIProvider,
  ToolDefinition,
  ToolUseOutput,
} from "../../interface";

// Pricing per million tokens (USD). Update when Anthropic changes pricing.
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-haiku-4-5-20251001": { inputPerM: 0.8, outputPerM: 4.0 },
};

// text-embedding-3-small equivalent: Voyage AI or Anthropic's embedding model.
// Anthropic uses voyage-3 internally; pricing approximation.
const EMBED_PRICING_PER_M_TOKENS = 0.06;

function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { inputPerM: 3.0, outputPerM: 15.0 };
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

export class AnthropicProvider implements IAIProvider {
  readonly id: string;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(model: string) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.id = `anthropic:${model}`;
  }

  async complete(input: CompletionInput, opts: CallOpts): Promise<CompletionOutput> {
    const start = Date.now();

    const signal = opts.deadline
      ? AbortSignal.timeout(Math.max(0, opts.deadline.getTime() - Date.now()))
      : undefined;

    const maxTokens = input.maxTokens ?? 1024;

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: maxTokens,
        temperature: input.temperature ?? 0.7,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.prompt }],
      },
      { signal },
    );

    const text =
      response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("") ?? "";

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = calcCostUsd(this.model, inputTokens, outputTokens);

    if (costUsd * 100 > opts.costBudgetCents) {
      throw new BudgetExceededError(
        `Job ${opts.jobId} exceeded cost budget: ${(costUsd * 100).toFixed(2)}¢ > ${opts.costBudgetCents}¢`,
        { inputTokens, outputTokens, costUsd, model: this.model, provider: "anthropic" },
      );
    }

    return {
      text,
      inputTokens,
      outputTokens,
      costUsd,
      model: this.model,
      provider: "anthropic",
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Structured JSON output via Anthropic tool_use.
   * Forces the model to call `tools[0]` and returns its input as `toolResult`.
   * This is the canonical way to get guaranteed-schema JSON from Claude.
   */
  async completionWithTools(
    input: CompletionInput,
    tools: ToolDefinition[],
    opts: CallOpts,
  ): Promise<ToolUseOutput> {
    const start = Date.now();

    const signal = opts.deadline
      ? AbortSignal.timeout(Math.max(0, opts.deadline.getTime() - Date.now()))
      : undefined;

    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    // When a single tool is provided, force the model to call it (structured output).
    // When multiple tools are provided, let the model choose (agentic tool selection).
    const toolChoice: Anthropic.ToolChoiceTool | Anthropic.ToolChoiceAuto =
      tools.length === 1
        ? { type: "tool", name: tools[0]!.name }
        : { type: "auto" };

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: input.maxTokens ?? 2048,
        temperature: input.temperature ?? 0,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.prompt }],
        tools: anthropicTools,
        tool_choice: toolChoice,
      },
      { signal },
    );

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = calcCostUsd(this.model, inputTokens, outputTokens);

    if (costUsd * 100 > opts.costBudgetCents) {
      throw new BudgetExceededError(
        `Job ${opts.jobId} exceeded cost budget: ${(costUsd * 100).toFixed(2)}¢ > ${opts.costBudgetCents}¢`,
        { inputTokens, outputTokens, costUsd, model: this.model, provider: "anthropic" },
      );
    }

    const toolUseBlock = response.content.find((b) => b.type === "tool_use") as
      | { type: "tool_use"; name: string; input: Record<string, unknown> }
      | undefined;

    const textBlock = response.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;

    return {
      // Include _toolName so callers can identify which tool was selected.
      toolResult: toolUseBlock
        ? { _toolName: toolUseBlock.name, ...toolUseBlock.input }
        : null,
      text: textBlock?.text ?? null,
      inputTokens,
      outputTokens,
      costUsd,
      model: this.model,
      provider: "anthropic",
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Generate embeddings via Anthropic's embedding endpoint (voyage-3-lite).
   * Used by the pgvector retrieval path in the landing-page copy step.
   */
  async embed(input: EmbedInput, opts: CallOpts): Promise<EmbedOutput> {
    const start = Date.now();

    // Anthropic uses the embeddings beta endpoint.
    // The model name for embeddings is separate from the chat model.
    const embedModel = "voyage-3-lite";

    // @ts-expect-error — Anthropic SDK types may not include embeddings yet;
    // the endpoint is available in production but the TS typings lag behind.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const response = await (this.client.embeddings as { create: Function }).create({
      model: embedModel,
      input: input.texts,
      input_type: "document",
    });

    // Reshape to number[][]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embeddings: number[][] = (response as any).data.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d: any) => d.embedding as number[],
    );

    // Approximate cost: voyage-3-lite pricing
    const totalChars = input.texts.reduce((s, t) => s + t.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);
    const costUsd = (estimatedTokens * EMBED_PRICING_PER_M_TOKENS) / 1_000_000;

    if (costUsd * 100 > opts.costBudgetCents) {
      throw new BudgetExceededError(
        `Embed job ${opts.jobId} exceeded cost budget`,
        { inputTokens: estimatedTokens, outputTokens: 0, costUsd, model: embedModel, provider: "anthropic" },
      );
    }

    return {
      embeddings,
      inputTokens: estimatedTokens,
      costUsd,
      model: embedModel,
      provider: "anthropic",
      latencyMs: Date.now() - start,
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.models.retrieve(this.model);
      return true;
    } catch {
      return false;
    }
  }
}

// Factory helpers used by ProviderRouter.
export function createAnthropicSonnet(): AnthropicProvider {
  return new AnthropicProvider("claude-sonnet-4-6");
}

export function createAnthropicHaiku(): AnthropicProvider {
  return new AnthropicProvider("claude-haiku-4-5-20251001");
}
