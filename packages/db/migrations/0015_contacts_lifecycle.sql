-- step-20 extension: lifecycle stage + custom properties + lead score on contacts
-- Foundation for downstream steps:
--   step-25 (behavioral tracking + AI lead scoring) populates lead_score
--   step-26 (email sequences) triggers on lifecycle_stage transitions
--   step-27 (deal pipeline) reads lifecycle_stage to surface sales-ready contacts
--   step-28 (segment builder) filters on all three columns

-- ─── enum: contact_lifecycle_stage ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "contact_lifecycle_stage" AS ENUM (
    'subscriber',
    'lead',
    'mql',
    'sql',
    'customer',
    'evangelist'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── contacts: new columns ───────────────────────────────────────────────────
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "lifecycle_stage" "contact_lifecycle_stage" NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS "custom_properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "lead_score" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Index lifecycle_stage for segment filters (step-28).
CREATE INDEX IF NOT EXISTS "contacts_lifecycle_stage_idx"
  ON "contacts" USING btree ("tenant_id", "lifecycle_stage");
--> statement-breakpoint

-- Index lead_score for "high score" segment queries (step-28).
CREATE INDEX IF NOT EXISTS "contacts_lead_score_idx"
  ON "contacts" USING btree ("tenant_id", "lead_score");
