-- step-25: Behavioral tracking + AI lead scoring
-- events: append-only, partitioned by month for 18-month rolling retention.
-- contact_score_history: immutable audit log for score changes.
-- FADP compliance: no IP stored; anonymous_id is a first-party UUID cookie.

-- ─── event_type enum ──────────────────────────────────────────────────────────
CREATE TYPE "event_type" AS ENUM (
  'page_view',
  'scroll_50',
  'scroll_90',
  'time_30s',
  'form_view',
  'form_step_complete',
  'cta_click',
  'email_open',
  'email_click'
);

-- ─── events (partitioned by occurred_at month) ────────────────────────────────
CREATE TABLE "events" (
  "id"           uuid          NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"    uuid          NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "contact_id"   uuid          REFERENCES "contacts"("id") ON DELETE SET NULL,
  "anonymous_id" text          NOT NULL,
  "event_type"   "event_type"  NOT NULL,
  "properties"   jsonb         NOT NULL DEFAULT '{}',
  "page_url"     text,
  "referrer"     text,
  "country_code" text,
  "occurred_at"  timestamptz   NOT NULL DEFAULT now()
) PARTITION BY RANGE ("occurred_at");

-- Indexes on the parent (inherited by all partitions)
CREATE INDEX "events_tenant_id_idx"    ON "events" ("tenant_id");
CREATE INDEX "events_contact_id_idx"   ON "events" ("contact_id") WHERE "contact_id" IS NOT NULL;
CREATE INDEX "events_anonymous_id_idx" ON "events" ("anonymous_id");
CREATE INDEX "events_occurred_at_idx"  ON "events" ("occurred_at");

-- Seed the first 6 monthly partitions (covers 2026-06 through 2026-11).
-- The maintenance cron (step-25 ADR-0022) creates new partitions monthly and
-- drops partitions older than 18 months. For now we create the current month.
CREATE TABLE "events_2026_06" PARTITION OF "events"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "events_2026_07" PARTITION OF "events"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "events_2026_08" PARTITION OF "events"
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "events_2026_09" PARTITION OF "events"
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "events_2026_10" PARTITION OF "events"
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "events_2026_11" PARTITION OF "events"
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

-- ─── contact_score_history ────────────────────────────────────────────────────
-- Immutable append-only log. One row per scoring run that produces a delta > 0.
CREATE TABLE "contact_score_history" (
  "id"            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"     uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "contact_id"    uuid        NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "score"         integer     NOT NULL,
  "previous_score" integer    NOT NULL DEFAULT 0,
  "reasoning"     text,
  "scored_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "contact_score_history_contact_id_idx" ON "contact_score_history" ("contact_id", "scored_at" DESC);
CREATE INDEX "contact_score_history_tenant_id_idx"  ON "contact_score_history" ("tenant_id");
