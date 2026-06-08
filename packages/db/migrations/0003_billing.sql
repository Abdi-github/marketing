-- Migration 0003: Billing tables (step-11 / Phase 5)
-- Creates: stripe_customers, subscriptions, usage_records, invoices, webhook_events
-- RLS: all tables tenant-scoped except webhook_events (tenant_id nullable for pre-customer events)

CREATE TYPE "public"."subscription_status" AS ENUM(
  'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete'
);--> statement-breakpoint

CREATE TYPE "public"."usage_metric" AS ENUM(
  'ai_tokens_in', 'ai_tokens_out', 'ai_cost_cents', 'storage_bytes'
);--> statement-breakpoint

-- ─── stripe_customers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stripe_customers" (
  "tenant_id"          uuid PRIMARY KEY NOT NULL,
  "stripe_customer_id" text NOT NULL UNIQUE,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "stripe_customers"
  ADD CONSTRAINT "stripe_customers_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

-- ─── subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"               uuid NOT NULL,
  "stripe_subscription_id"  text NOT NULL UNIQUE,
  "plan"                    text NOT NULL,
  "status"                  "subscription_status" NOT NULL,
  "current_period_start"    timestamp with time zone NOT NULL,
  "current_period_end"      timestamp with time zone NOT NULL,
  "cancel_at"               timestamp with time zone,
  "created_at"              timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"              timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscriptions_tenant_id_idx" ON "subscriptions" USING btree ("tenant_id");
--> statement-breakpoint

-- ─── usage_records ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "usage_records" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL,
  "metric"              "usage_metric" NOT NULL,
  "quantity"            integer NOT NULL,
  "recorded_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "pushed_to_stripe_at" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "usage_records"
  ADD CONSTRAINT "usage_records_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "usage_records_tenant_id_idx" ON "usage_records" USING btree ("tenant_id");
--> statement-breakpoint

-- ─── invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invoices" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"         uuid NOT NULL,
  "stripe_invoice_id" text NOT NULL UNIQUE,
  "amount_cents"      integer NOT NULL,
  "currency"          text NOT NULL DEFAULT 'chf',
  "status"            text NOT NULL,
  "pdf_url"           text,
  "due_at"            timestamp with time zone,
  "paid_at"           timestamp with time zone,
  "created_at"        timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoices_tenant_id_idx" ON "invoices" USING btree ("tenant_id");
--> statement-breakpoint

-- ─── webhook_events ───────────────────────────────────────────────────────────
-- tenant_id is nullable: some events arrive before a customer record is linked.
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid,
  "provider"     text NOT NULL,
  "event_id"     text NOT NULL,
  "event_type"   text NOT NULL,
  "payload"      jsonb NOT NULL,
  "received_at"  timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_id_unique"
  ON "webhook_events" USING btree ("provider", "event_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_events_tenant_id_idx"
  ON "webhook_events" USING btree ("tenant_id");
--> statement-breakpoint

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY stripe_customers_tenant_isolation ON stripe_customers
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_tenant_isolation ON subscriptions
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_records_tenant_isolation ON usage_records
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- webhook_events: RLS policy allows rows where tenant_id matches OR tenant_id IS NULL
-- (pre-customer events). Bypass RLS is used by the webhook handler (server role).
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_events_tenant_isolation ON webhook_events
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid
  );

-- ─── Update _rls_coverage view ────────────────────────────────────────────────
CREATE OR REPLACE VIEW _rls_coverage AS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    'tenants', 'feature_flags',
    'users', 'sessions', 'accounts', 'verifications',
    'outbox', 'event_processed',
    '_rls_coverage'
  );
