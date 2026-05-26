import type { CompletionInput, CompletionOutput, IAIProvider } from "../interface";

// EchoProvider — proves the IAIProvider abstraction with zero external deps.
// Step 1 in the AI integration order (see docs/EXECUTION_PLAN.md §AI integration order).
export class EchoProvider implements IAIProvider {
  readonly name = "echo";
  readonly model = "echo-1";

  async complete(input: CompletionInput): Promise<CompletionOutput> {
    const start = Date.now();
    const text = `[ECHO] ${input.prompt}`;
    return {
      text,
      inputTokens: Math.ceil(input.prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      model: this.model,
      provider: this.name,
      latencyMs: Date.now() - start,
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
