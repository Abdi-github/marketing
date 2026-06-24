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
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // ─── Auth (Better-Auth, Phase 3+) ─────────────────────────────────────────
  // BETTER_AUTH_SECRET: generate with `openssl rand -base64 32`
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-in-production"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  // ─── Email (Phase 4 — Resend primary, Postmark fallback) ──────────────────
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  POSTMARK_API_KEY: z.string().optional(),
  // Sender address shown to recipients. Must be a verified domain in Resend.
  EMAIL_FROM_ADDRESS: z.string().default("noreply@marketing.localhost"),

  // ─── AI — Text (Phase 4) ──────────────────────────────────────────────────
  // Primary: Anthropic Claude (Sonnet for content, Haiku for routing/eval)
  ANTHROPIC_API_KEY: z.string().optional(),
  // Fallback: OpenAI (activated when Anthropic circuit-breaker opens)
  OPENAI_API_KEY: z.string().optional(),
  // Force-use a specific fallback for integration testing without a live Anthropic key.
  // Values: "openai" | "echo". Unset = auto-routing.
  AI_PROVIDER_FALLBACK: z.enum(["openai", "echo"]).optional(),

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
  // Stripe Price IDs (created in Stripe Dashboard, test mode).
  STRIPE_STARTER_PRICE_ID: z.string().optional(),
  STRIPE_GROWTH_PRICE_ID: z.string().optional(),
  // App base URL (used to build Stripe Checkout success/cancel URLs).
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Edge IP that custom domains' A records should point at. Set per deploy
  // target (Fly anycast IP, dedicated proxy, etc.). Surfaced to tenants in the
  // "Add domain" DNS instructions for root-domain (apex) setups.
  PLATFORM_EDGE_IP: z.string().optional(),
  // Edge hostname that custom subdomains' CNAME records should point at.
  // Used as the recommended record for subdomains (e.g., cafe.swiftapp.ch)
  // because CNAMEs follow edge IP changes automatically.
  // Example: "proxy.marketing.app" or "<app-name>.fly.dev".
  PLATFORM_EDGE_CNAME: z.string().optional(),
  // Custom-domain certificate provider.
  // - stub: local/dev only unless DOMAIN_CERT_ALLOW_STUB=true.
  // - fly: use Fly.io GraphQL API to add the hostname certificate.
  // - webhook: call a deploy-target-owned HTTPS endpoint that provisions the cert.
  // - manual: fail visibly; useful before the production edge choice is finalized.
  DOMAIN_CERT_PROVIDER: z.enum(["stub", "fly", "webhook", "manual"]).default("stub"),
  DOMAIN_CERT_ALLOW_STUB: z.enum(["true", "false"]).default("false"),
  DOMAIN_CERT_WEBHOOK_URL: z.string().url().optional(),
  DOMAIN_CERT_WEBHOOK_SECRET: z.string().optional(),
  FLY_API_TOKEN: z.string().optional(),
  FLY_APP_NAME: z.string().optional(),
  FLY_APP_ID: z.string().optional(),
  // Note: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a build-time var (Next.js
  // NEXT_PUBLIC_ prefix). Add it to .env.local but it is NOT validated here
  // because it is inlined at build time, not read from process.env at runtime
  // in the worker/server context where this schema runs.

  // ─── Integrations — encryption (Phase 7) ─────────────────────────────────
  // 256-bit AES key for encrypting OAuth tokens / API keys at rest.
  // Generate with: openssl rand -hex 32
  INTEGRATION_ENCRYPTION_KEY: z.string().length(64).optional(),

  // ─── Integrations — webhook secrets (Phase 7) ────────────────────────────
  GASTROFIX_WEBHOOK_SECRET: z.string().optional(),
  EVERSPORTS_WEBHOOK_SECRET: z.string().optional(),

  // ─── Integrations — Meta / Facebook (Phase 9) ────────────────────────────
  // App ID + Secret from developers.facebook.com
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),

  // ─── WhatsApp Business Cloud API (step-29) ───────────────────────────────
  // Permanent user access token from Meta App dashboard.
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  // Phone Number ID (not the phone number itself) from Meta WABA dashboard.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  // Secret token you define for Meta webhook verification.
  WHATSAPP_VERIFY_TOKEN: z.string().default("marketing-wa-verify"),
  WHATSAPP_TEST_MODE_ENABLED: z.enum(["true", "false"]).default("false"),
  WHATSAPP_TEST_TENANT_SLUG: z.string().optional(),

  // ─── Swiss SMS — aspsms.ch (step-29) ─────────────────────────────────────
  SMS_PROVIDER: z.enum(["aspsms", "twilio", "sandbox"]).default("aspsms"),
  ASPSMS_USER_KEY: z.string().optional(),
  ASPSMS_PASSWORD: z.string().optional(),
  // Sender name shown on recipient handset (max 11 chars alphanumeric).
  ASPSMS_ORIGINATOR: z.string().max(11).default("Marketing"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  SMS_TEST_MODE_ENABLED: z.enum(["true", "false"]).default("false"),
  SMS_TEST_TENANT_SLUG: z.string().optional(),
  SMS_INBOUND_CALLBACK_URL: z.string().url().optional(),
  SMS_STATUS_CALLBACK_URL: z.string().url().optional(),
  SMS_DAILY_TENANT_CAP: z.coerce.number().int().positive().default(100),
  SMS_DAILY_CONTACT_CAP: z.coerce.number().int().positive().default(6),
});

const _result = schema.safeParse(process.env);

if (!_result.success) {
  throw new Error(
    `Invalid environment variables — check .env.local against .env.example\n` +
      JSON.stringify(_result.error.flatten().fieldErrors, null, 2),
  );
}

function normalizeRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "localhost" &&
      (parsed.protocol === "redis:" || parsed.protocol === "rediss:")
    ) {
      parsed.hostname = "127.0.0.1";
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

export const env = {
  ..._result.data,
  REDIS_URL: normalizeRedisUrl(_result.data.REDIS_URL),
};
