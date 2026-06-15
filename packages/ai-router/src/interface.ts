// IAIProvider — the only abstraction that should ever appear in worker/queue code.
// See docs/ADRs/0003-ai-provider-abstraction.md and docs/AI_GUIDELINES.md.

/** Thrown by adapters when a call succeeds but cost exceeds the per-job budget.
 *  Carries usage data so the router can still write ai_usage before aborting. */
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly usage: {
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      model: string;
      provider: string;
    },
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Thrown by optional methods (completionWithTools, embed) on providers that
 *  have not implemented them yet. The router catches this and should fail fast
 *  rather than retrying — it's a configuration error, not a transient failure. */
export class NotImplementedError extends Error {
  constructor(method: string, provider: string) {
    super(`${provider} does not implement ${method}`);
    this.name = "NotImplementedError";
  }
}

export type CallOpts = {
  tenantId: string;
  jobId: string;
  promptId: string;
  promptVersion: number;
  /** Per-job hard cap in US cents. Adapters abort if cost exceeds this. */
  costBudgetCents: number;
  /** Absolute deadline; adapters translate to AbortSignal. */
  deadline?: Date;
};

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
  costUsd: number;
  model: string;
  provider: string;
  latencyMs: number;
};

// ─── Tool-use types (used by completionWithTools) ────────────────────────────

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object describing the input parameters. */
  inputSchema: Record<string, unknown>;
};

export type ToolUseOutput = {
  /** Parsed, validated tool call result. null if the model chose plain text. */
  toolResult: Record<string, unknown> | null;
  /** Full text if the model responded without invoking a tool. */
  text: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  provider: string;
  latencyMs: number;
};

// ─── Embedding types (used by embed) ─────────────────────────────────────────

export type EmbedInput = {
  texts: string[];
  /** Caller-provided content hash for cache-key generation. Optional. */
  contentHashes?: string[];
};

export type EmbedOutput = {
  /** Parallel array of embedding vectors (float32). */
  embeddings: number[][];
  inputTokens: number;
  costUsd: number;
  model: string;
  provider: string;
  latencyMs: number;
};

// ─── IAIProvider ─────────────────────────────────────────────────────────────

// ─── Image generation types ───────────────────────────────────────────────────

export type AspectRatio = "1:1" | "4:3" | "3:4" | "4:5" | "16:9" | "9:16";

export type ImageInput = {
  prompt: string;
  width?: number;
  height?: number;
  /** Number of images to generate. Defaults to 1. */
  numOutputs?: number;
  /** Output aspect ratio. Defaults to "1:1". */
  aspectRatio?: AspectRatio;
  /** When set, run img2img (edit an existing image). Only supported by FLUX Kontext. */
  inputImageUrl?: string;
  /** Optional provider-native model id when the caller needs a quality tier. */
  preferredModelId?: string;
  /** Optional allow-list for callers that should not fall back to cheaper models. */
  allowedModelIds?: string[];
};

export type ImageOutput = {
  /** Public URL of the generated image. May be temporary depending on provider. */
  url: string;
  /** Estimated cost in USD. Image providers are billed per run, not per token. */
  costUsd: number;
  model: string;
  provider: string;
  latencyMs: number;
};

// ─── IAIProvider ─────────────────────────────────────────────────────────────

export interface IAIProvider {
  readonly id: string;
  readonly model: string;
  complete(input: CompletionInput, opts: CallOpts): Promise<CompletionOutput>;
  isHealthy(): Promise<boolean>;

  /**
   * Structured JSON output via tool-use. The model is forced to call
   * `tools[0]` and the result is returned as `toolResult`.
   * Optional: providers that don't support tool-use throw NotImplementedError.
   */
  completionWithTools?(
    input: CompletionInput,
    tools: ToolDefinition[],
    opts: CallOpts,
  ): Promise<ToolUseOutput>;

  /**
   * Generate embeddings for one or more texts.
   * Optional: providers that don't support embeddings throw NotImplementedError.
   */
  embed?(input: EmbedInput, opts: CallOpts): Promise<EmbedOutput>;

  /**
   * Generate an image from a text prompt.
   * Optional: only image-capable providers implement this.
   * Callers check `typeof provider.generateImage === "function"` before calling.
   */
  generateImage?(
    input: ImageInput,
    opts: Pick<CallOpts, "tenantId" | "jobId">,
  ): Promise<ImageOutput>;
}
