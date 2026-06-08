-- Migration 0005: Integration connections (step-13 / Phase 7)
-- Creates: integration_connections
-- Amends:  webhook_events (adds signature column for provider HMAC audit)
-- Design: single generic table per ADR-0013 (not per-provider tables)
-- webhook_events was created in migration 0003 (billing); reused here for all integrations.

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "public"."integration_provider" AS ENUM(
  'gastrofix',
  'lightspeed_ch',
  'eversports',
  'bexio',
  'meta',
  'google_business',
  'resend'
);--> statement-breakpoint

CREATE TYPE "public"."connection_status" AS ENUM(
  'connected',
  'disconnected',
  'error',
  'token_expired'
);--> statement-breakpoint

-- ─── integration_connections ─────────────────────────────────────────────────
-- One row per (tenant_id, provider, external_account_id).
-- oauth_tokens: AES-256-GCM encrypted JSON blob.
-- meta: provider-specific non-secret extra data validated by the adapter.

CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"            uuid NOT NULL,
  "provider"             "integration_provider" NOT NULL,
  "external_account_id"  text NOT NULL DEFAULT 'default',
  "oauth_tokens"         text NOT NULL,
  "scopes"               text[] NOT NULL DEFAULT '{}',
  "status"               "connection_status" NOT NULL DEFAULT 'connected',
  "meta"                 jsonb NOT NULL DEFAULT '{}',
  "connected_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "last_sync_at"         timestamp with time zone,
  "updated_at"           timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "integration_connections"
  ADD CONSTRAINT "integration_connections_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "integration_connections_tenant_id_idx"
  ON "integration_connections" USING btree ("tenant_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "integration_connections_tenant_provider_account_unique"
  ON "integration_connections" USING btree ("tenant_id", "provider", "external_account_id");
--> statement-breakpoint

ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "integration_connections_tenant_isolation"
  ON "integration_connections"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
--> statement-breakpoint

-- ─── webhook_events amendment ─────────────────────────────────────────────────
-- The webhook_events table was created in migration 0003 (billing).
-- Adding signature column for HMAC audit trail on integration webhooks.

ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "signature" text;
--> statement-breakpoint
