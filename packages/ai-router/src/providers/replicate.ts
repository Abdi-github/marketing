import type {
  IAIProvider,
  CompletionInput,
  CompletionOutput,
  CallOpts,
  ImageInput,
  ImageOutput,
} from "../interface";
import { NotImplementedError } from "../interface";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
};

type ModelConfig = {
  id: string;
  buildInput: (input: ImageInput) => Record<string, unknown>;
  costUsd: number;
};

export const REPLICATE_MODEL_FLUX_2_PRO = "black-forest-labs/flux-2-pro" as const;
export const REPLICATE_MODEL_NANO_BANANA_2 = "google/nano-banana-2" as const;

// Extracts the image URL from whatever shape a Replicate model returns.
// Models return: string | string[] | { url: string }[] — handle all three.
function extractUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first) {
      return (first as { url: string }).url;
    }
  }
  throw new Error(`Cannot extract image URL from Replicate output: ${JSON.stringify(output)}`);
}

// Text-to-image fallback chain — tried in order on 402 (insufficient credit).
// Free-trial models sourced from replicate.com/collections/try-for-free.
const IMAGE_MODEL_CHAIN: ModelConfig[] = [
  {
    id: "black-forest-labs/flux-schnell",
    buildInput: (input) => ({
      prompt: input.prompt,
      num_outputs: 1,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "webp",
      output_quality: 80,
      num_inference_steps: 4,
    }),
    costUsd: 0.003,
  },
  {
    id: "black-forest-labs/flux-dev",
    buildInput: (input) => ({
      prompt: input.prompt,
      num_outputs: 1,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "webp",
      output_quality: 80,
    }),
    costUsd: 0.025,
  },
  {
    id: "google/imagen-4",
    buildInput: (input) => ({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "webp",
    }),
    costUsd: 0.04,
  },
  {
    id: "ideogram-ai/ideogram-v3-turbo",
    buildInput: (input) => ({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
    }),
    costUsd: 0.03,
  },
  {
    id: "black-forest-labs/flux-1.1-pro",
    buildInput: (input) => ({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: input.preferredModelId ? "png" : "webp",
      output_quality: input.preferredModelId ? 95 : 80,
    }),
    costUsd: 0.04,
  },
  {
    id: REPLICATE_MODEL_FLUX_2_PRO,
    buildInput: (input) => ({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "png",
      output_quality: 95,
    }),
    costUsd: 0.05,
  },
  {
    id: REPLICATE_MODEL_NANO_BANANA_2,
    buildInput: (input) => ({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "png",
    }),
    costUsd: 0.04,
  },
  {
    id: "black-forest-labs/flux-kontext-pro",
    buildInput: (input) => ({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      output_format: "webp",
    }),
    costUsd: 0.04,
  },
];

// FLUX Kontext Pro is the dedicated img2img model.
const KONTEXT_MODEL: ModelConfig = {
  id: "black-forest-labs/flux-kontext-pro",
  buildInput: (input) => ({
    prompt: input.prompt,
    input_image: input.inputImageUrl,
    aspect_ratio: input.aspectRatio ?? "1:1",
    output_format: "webp",
  }),
  costUsd: 0.04,
};

export class ReplicateProvider implements IAIProvider {
  readonly id = "replicate";
  readonly model = IMAGE_MODEL_CHAIN[0]!.id;

  constructor(private readonly apiToken: string) {}

  async complete(_input: CompletionInput, _opts: CallOpts): Promise<CompletionOutput> {
    throw new NotImplementedError("complete", this.id);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${REPLICATE_API_BASE}/models/${IMAGE_MODEL_CHAIN[0]!.id}`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateImage(
    input: ImageInput,
    _opts: Pick<CallOpts, "tenantId" | "jobId">,
  ): Promise<ImageOutput> {
    const start = Date.now();

    // img2img path — FLUX Kontext Pro only (other models don't support input_image).
    if (input.inputImageUrl) {
      const url = await this.runModelWithRetry(KONTEXT_MODEL, input);
      return {
        url,
        costUsd: KONTEXT_MODEL.costUsd,
        model: KONTEXT_MODEL.id,
        provider: this.id,
        latencyMs: Date.now() - start,
      };
    }

    // Text-to-image path — fallback chain on 402.
    const creditErrors: string[] = [];
    for (const model of preferredModelChain(input.preferredModelId, input.allowedModelIds)) {
      try {
        const url = await this.runModelWithRetry(model, input);
        return {
          url,
          costUsd: model.costUsd,
          model: model.id,
          provider: this.id,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        if (isCreditsError(err)) {
          creditErrors.push(`${model.id}: ${String(err)}`);
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `All Replicate models exhausted (insufficient credits on all). Tried: ${creditErrors.join(" | ")}`,
    );
  }

  // Wraps runModel with 429 retry logic (up to 3 times, using retry_after hint).
  private async runModelWithRetry(model: ModelConfig, input: ImageInput): Promise<string> {
    const MAX_RATE_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RATE_RETRIES; attempt++) {
      const res = await fetch(`${REPLICATE_API_BASE}/models/${model.id}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input: model.buildInput(input) }),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.status === 429) {
        if (attempt === MAX_RATE_RETRIES) {
          const text = await res.text().catch(() => "rate limit exceeded");
          throw new Error(`Replicate API error 429: ${text}`);
        }
        let waitMs = 15_000;
        try {
          const body = (await res.json()) as { retry_after?: number };
          if (typeof body.retry_after === "number") {
            waitMs = Math.ceil(body.retry_after) * 1000 + 1000;
          }
        } catch {
          /* use default */
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "unknown error");
        throw new Error(`Replicate API error ${res.status}: ${text}`);
      }

      const prediction = (await res.json()) as ReplicatePrediction;
      if (prediction.status === "failed" || prediction.error) {
        throw new Error(`Replicate prediction failed: ${prediction.error ?? "unknown"}`);
      }

      let final = prediction;
      if (final.status !== "succeeded") {
        final = await this.pollUntilDone(prediction.id);
      }

      return extractUrl(final.output);
    }

    throw new Error("Replicate: unexpected exit from retry loop");
  }

  private async pollUntilDone(predictionId: string): Promise<ReplicatePrediction> {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${REPLICATE_API_BASE}/predictions/${predictionId}`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const p = (await res.json()) as ReplicatePrediction;
      if (p.status === "succeeded" || p.status === "failed") return p;
    }
    throw new Error(`Replicate prediction ${predictionId} timed out after 60 s`);
  }
}

function preferredModelChain(
  preferredModelId: string | undefined,
  allowedModelIds: string[] | undefined,
): ModelConfig[] {
  const allowed =
    allowedModelIds && allowedModelIds.length > 0
      ? IMAGE_MODEL_CHAIN.filter((model) => allowedModelIds.includes(model.id))
      : IMAGE_MODEL_CHAIN;
  if (!preferredModelId) return allowed;
  const preferred = allowed.find((model) => model.id === preferredModelId);
  if (!preferred) return allowed;
  return [preferred, ...allowed.filter((model) => model.id !== preferred.id)];
}

function isCreditsError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("402") || msg.includes("insufficient credit") || msg.includes("payment required")
  );
}

export function createReplicateProvider(apiToken: string): ReplicateProvider {
  return new ReplicateProvider(apiToken);
}
