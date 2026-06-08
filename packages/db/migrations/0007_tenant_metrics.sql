-- Migration 0007: Retention metrics (step-16)
-- Adds:
--   tenants.first_post_at   (timestamptz, nullable) — stamped once on first AI post
--   tenants.first_paid_at   (timestamptz, nullable) — stamped once on first paid subscription
--   tenants.churned_at      (timestamptz, nullable) — stamped on subscription cancellation
--   tenant_metrics_daily    — one row per (tenant, calendar day); see ADR-0016

-- ─── Milestone timestamps on tenants ─────────────────────────────────────────
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "first_post_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "first_paid_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "churned_at" timestamp with time zone;
--> statement-breakpoint

-- ─── tenant_metrics_daily ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tenant_metrics_daily" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "day_date"         date NOT NULL,
  "vertical"         text NOT NULL,
  "posts_generated"  integer NOT NULL DEFAULT 0,
  "leads_captured"   integer NOT NULL DEFAULT 0,
  "plan"             text NOT NULL DEFAULT 'trial',
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_metrics_daily_tenant_day_unique"
  ON "tenant_metrics_daily" ("tenant_id", "day_date");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tenant_metrics_daily_tenant_id_idx"
  ON "tenant_metrics_daily" ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tenant_metrics_daily_day_date_idx"
  ON "tenant_metrics_daily" ("day_date");
--> statement-breakpoint

-- RLS: reads scoped to current tenant; writes via service role (no RLS on writes).
ALTER TABLE "tenant_metrics_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_metrics_daily_tenant_isolation"
  ON "tenant_metrics_daily"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint
