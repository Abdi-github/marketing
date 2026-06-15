import type {
  CallOpts,
  CompletionInput,
  CompletionOutput,
  EmbedInput,
  EmbedOutput,
  IAIProvider,
  ImageInput,
  ImageOutput,
  ToolDefinition,
  ToolUseOutput,
} from "../interface";

// EchoProvider — proves the IAIProvider abstraction with zero external deps.
// completionWithTools returns the first tool's name as a dummy stub.
// embed returns zero-vectors (1536-dimensional).
export class EchoProvider implements IAIProvider {
  readonly id = "echo";
  readonly model = "echo-1";

  async complete(input: CompletionInput, _opts: CallOpts): Promise<CompletionOutput> {
    const start = Date.now();
    const text = `[ECHO] ${input.prompt}`;
    return {
      text,
      inputTokens: Math.ceil(input.prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      costUsd: 0,
      model: this.model,
      provider: this.id,
      latencyMs: Date.now() - start,
    };
  }

  async completionWithTools(
    input: CompletionInput,
    tools: ToolDefinition[],
    _opts: CallOpts,
  ): Promise<ToolUseOutput> {
    const start = Date.now();
    const tool = tools[0];
    const toolResult = tool ? { tool: tool.name, _toolName: tool.name, _echo: true } : null;
    const text = `[ECHO-TOOL] ${input.prompt}`;
    return {
      toolResult,
      text,
      inputTokens: Math.ceil(input.prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      costUsd: 0,
      model: this.model,
      provider: this.id,
      latencyMs: Date.now() - start,
    };
  }

  async embed(input: EmbedInput, _opts: CallOpts): Promise<EmbedOutput> {
    const start = Date.now();
    const embeddings = input.texts.map(() => new Array(1536).fill(0) as number[]);
    return {
      embeddings,
      inputTokens: input.texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0),
      costUsd: 0,
      model: this.model,
      provider: this.id,
      latencyMs: Date.now() - start,
    };
  }

  async generateImage(
    input: ImageInput,
    _opts: Pick<CallOpts, "tenantId" | "jobId">,
  ): Promise<ImageOutput> {
    const start = Date.now();
    // Deterministic placeholder: a grey SVG square with the prompt as alt text.
    const encoded = encodeURIComponent(input.prompt.slice(0, 60));
    const url = `https://placehold.co/1024x1024/e5e7eb/6b7280?text=${encoded}`;
    return {
      url,
      costUsd: 0,
      model: "echo-image-1",
      provider: this.id,
      latencyMs: Date.now() - start,
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
