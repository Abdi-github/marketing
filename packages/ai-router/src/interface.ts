// IAIProvider — the only abstraction that should ever appear in worker/queue code.
// See docs/ADRs/0003-ai-provider-abstraction.md and docs/AI_GUIDELINES.md.

export type CompletionInput = {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
};

export type CompletionOutput = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  latencyMs: number;
};

export interface IAIProvider {
  readonly name: string;
  readonly model: string;
  complete(input: CompletionInput): Promise<CompletionOutput>;
  isHealthy(): Promise<boolean>;
}
