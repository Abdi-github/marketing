import { z } from "zod";

const schema = z.object({
  // ─── Runtime ───────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ─── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5432/marketing_dev"),

  // ─── Redis / Queue ────────────────────────────────────────────────────────
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // ─── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // ─── Auth (Better-Auth, Phase 3+) ─────────────────────────────────────────
  // BETTER_AUTH_SECRET: generate with `openssl rand -base64 32`
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-in-production"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  // ─── Email (Phase 4 — Resend primary, Postmark fallback) ──────────────────
  RESEND_API_KEY: z.string().optional(),
  POSTMARK_API_KEY: z.string().optional(),

  // ─── AI — Text (Phase 4) ──────────────────────────────────────────────────
  // Primary: Anthropic Claude (Sonnet for content, Haiku for routing/eval)
  ANTHROPIC_API_KEY: z.string().optional(),
  // Fallback: OpenAI (activated when Anthropic circuit-breaker opens)
  OPENAI_API_KEY: z.string().optional(),

  // ─── AI — Image (Phase 4) ─────────────────────────────────────────────────
  // Primary: FLUX via Replicate (schnell for drafts, pro for finals)
  REPLICATE_API_TOKEN: z.string().optional(),

  // ─── AI Observability — Langfuse (Phase 4) ────────────────────────────────
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),

  // ─── App Observability — OpenTelemetry (Phase 4+) ─────────────────────────
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("marketing"),

  // ─── Object Storage — Scaleway (CH-resident, Phase 2+) ────────────────────
  SCALEWAY_ACCESS_KEY: z.string().optional(),
  SCALEWAY_SECRET_KEY: z.string().optional(),
  SCALEWAY_BUCKET_NAME: z.string().optional(),
  SCALEWAY_REGION: z.string().optional(),
  SCALEWAY_ENDPOINT: z.string().url().optional(),
  SCW_DEFAULT_ORGANIZATION_ID: z.string().optional(),
  SCW_DEFAULT_PROJECT_ID: z.string().optional(),

  // ─── Billing — Stripe (Phase 5) ───────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Note: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a build-time var (Next.js
  // NEXT_PUBLIC_ prefix). Add it to .env.local but it is NOT validated here
  // because it is inlined at build time, not read from process.env at runtime
  // in the worker/server context where this schema runs.
});

const _result = schema.safeParse(process.env);

if (!_result.success) {
  throw new Error(
    `Invalid environment variables — check .env.local against .env.example\n` +
      JSON.stringify(_result.error.flatten().fieldErrors, null, 2),
  );
}

export const env = _result.data;
