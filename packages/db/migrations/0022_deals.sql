-- step-27: deal_stages + deals + deal_activities tables.
-- deal_stages are auto-seeded with 5 defaults per tenant on first use (via tRPC).
-- amounts stored as integer CHF (whole francs, not cents) for SME simplicity.
-- Outbox events: deal.created, deal.stage_changed, deal.won, deal.lost.

-- ─── deal_stages ─────────────────────────────────────────────────────────────
CREATE TABLE "deal_stages" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key"        text        NOT NULL,
  "label"      text        NOT NULL,
  "order"      integer     NOT NULL DEFAULT 0,
  "is_won"     boolean     NOT NULL DEFAULT false,
  "is_lost"    boolean     NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("tenant_id", "key")
);
ALTER TABLE "deal_stages" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "deal_stages_tenant_id_idx" ON "deal_stages"("tenant_id");

-- ─── deals ───────────────────────────────────────────────────────────────────
CREATE TABLE "deals" (
  "id"                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"            uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "contact_id"           uuid        REFERENCES "contacts"("id") ON DELETE SET NULL,
  "stage_id"             uuid        NOT NULL REFERENCES "deal_stages"("id"),
  "title"                text        NOT NULL,
  "amount_chf"           integer     NOT NULL DEFAULT 0,
  "expected_close_date"  date,
  "ai_summary"           text,
  "status"               text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'won', 'lost')),
  "won_at"               timestamptz,
  "lost_reason"          text,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "deals_tenant_id_idx"  ON "deals"("tenant_id");
CREATE INDEX "deals_stage_id_idx"   ON "deals"("stage_id");
CREATE INDEX "deals_contact_id_idx" ON "deals"("contact_id") WHERE "contact_id" IS NOT NULL;
CREATE INDEX "deals_status_idx"     ON "deals"("tenant_id", "status");

-- ─── deal_activities ──────────────────────────────────────────────────────────
-- Immutable log of notes, stage changes, emails, calls tied to a deal.
CREATE TABLE "deal_activities" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id"    uuid        NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "tenant_id"  uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "type"       text        NOT NULL CHECK (type IN ('note', 'stage_change', 'email', 'call')),
  "content"    text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "deal_activities" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "deal_activities_deal_id_idx"   ON "deal_activities"("deal_id");
CREATE INDEX "deal_activities_tenant_id_idx" ON "deal_activities"("tenant_id");
