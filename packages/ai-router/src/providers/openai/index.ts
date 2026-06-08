// OpenAI fallback adapter for IAIProvider.
// ONLY file in the codebase allowed to import the openai SDK.
// Activated when Anthropic circuit-breaker opens or AI_PROVIDER_FALLBACK=openai.
// See docs/ADRs/0003-ai-provider-abstraction.md.
import OpenAI from "openai";
import { env } from "@marketing/shared";
import { NotImplementedError } from "../../interface";
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

// Pricing per million tokens (USD). Approximate; update as OpenAI reprices.
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10.0 },
};

function calcCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { inputPerM: 2.5, outputPerM: 10.0 };
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

export class OpenAIProvider implements IAIProvider {
  readonly id: string;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(model: string) {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.id = `openai:${model}`;
  }

  async complete(input: CompletionInput, opts: CallOpts): Promise<CompletionOutput> {
    const start = Date.now();

    const signal = opts.deadline
      ? AbortSignal.timeout(Math.max(0, opts.deadline.getTime() - Date.now()))
      : undefined;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }
    messages.push({ role: "user", content: input.prompt });

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.7,
      },
      { signal },
    );

    const text = response.choices[0]?.message.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = calcCostUsd(this.model, inputTokens, outputTokens);

    if (costUsd * 100 > opts.costBudgetCents) {
      throw new Error(
        `Job ${opts.jobId} exceeded cost budget: ${(costUsd * 100).toFixed(2)}¢ > ${opts.costBudgetCents}¢`,
      );
    }

    return {
      text,
      inputTokens,
      outputTokens,
      costUsd,
      model: this.model,
      provider: "openai",
      latencyMs: Date.now() - start,
    };
  }

  // OpenAI tool-use is not wired in this step — the Anthropic adapter is the
  // only tool-use path needed for landing-page generation.
  async completionWithTools(
    _input: CompletionInput,
    _tools: ToolDefinition[],
    _opts: CallOpts,
  ): Promise<ToolUseOutput> {
    throw new NotImplementedError("completionWithTools", this.id);
  }

  // OpenAI embeddings can be added in Phase 7 as a fallback path.
  async embed(_input: EmbedInput, _opts: CallOpts): Promise<EmbedOutput> {
    throw new NotImplementedError("embed", this.id);
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

export function createOpenAIMini(): OpenAIProvider {
  return new OpenAIProvider("gpt-4o-mini");
}
