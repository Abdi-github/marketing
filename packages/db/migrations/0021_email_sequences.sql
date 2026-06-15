-- step-26: email_templates + email_sequences + email_sequence_enrollments + email_sends
-- ADR-0023: platform-level Resend send; per-tenant domain verification deferred.

-- ─── email_templates ─────────────────────────────────────────────────────────
CREATE TABLE "email_templates" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"     uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"          text        NOT NULL,
  "subject"       text        NOT NULL,
  "body_html"     text        NOT NULL,
  "body_text"     text        NOT NULL,
  "locale"        text        NOT NULL DEFAULT 'de-CH',
  "ai_drafted_at" timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "email_templates_tenant_id_idx" ON "email_templates"("tenant_id");

-- ─── email_sequence_trigger enum ─────────────────────────────────────────────
CREATE TYPE "email_sequence_trigger" AS ENUM (
  'lead.captured',
  'contact.score_changed',
  'contact.lifecycle_changed',
  'manual'
);

-- ─── email_sequences ──────────────────────────────────────────────────────────
-- steps JSONB: Array<{ delay_minutes: number; template_id: string }>
-- trigger_filter JSONB: e.g. {} (any), { "lifecycle_stage": "lead" }, { "min_delta": 10 }
CREATE TABLE "email_sequences" (
  "id"             uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"      uuid                    NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"           text                    NOT NULL,
  "trigger_event"  email_sequence_trigger  NOT NULL DEFAULT 'manual',
  "trigger_filter" jsonb                   NOT NULL DEFAULT '{}',
  "status"         text                    NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused')),
  "steps"          jsonb                   NOT NULL DEFAULT '[]',
  "created_at"     timestamptz             NOT NULL DEFAULT now(),
  "updated_at"     timestamptz             NOT NULL DEFAULT now()
);
ALTER TABLE "email_sequences" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "email_sequences_tenant_id_idx" ON "email_sequences"("tenant_id");

-- ─── email_sequence_enrollments ───────────────────────────────────────────────
-- UNIQUE(sequence_id, contact_id) — a contact can only be in a sequence once at a time.
CREATE TABLE "email_sequence_enrollments" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"    uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sequence_id"  uuid        NOT NULL REFERENCES "email_sequences"("id") ON DELETE CASCADE,
  "contact_id"   uuid        NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "current_step" integer     NOT NULL DEFAULT 0,
  "status"       text        NOT NULL DEFAULT 'enrolled'
                   CHECK (status IN ('enrolled', 'completed', 'exited', 'paused')),
  "enrolled_at"  timestamptz NOT NULL DEFAULT now(),
  "next_run_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  UNIQUE("sequence_id", "contact_id")
);
ALTER TABLE "email_sequence_enrollments" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "email_seq_enroll_tick_idx" ON "email_sequence_enrollments"("status", "next_run_at")
  WHERE "status" = 'enrolled';
CREATE INDEX "email_seq_enroll_tenant_idx" ON "email_sequence_enrollments"("tenant_id");

-- ─── email_sends ──────────────────────────────────────────────────────────────
CREATE TABLE "email_sends" (
  "id"                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"          uuid        NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "enrollment_id"      uuid        REFERENCES "email_sequence_enrollments"("id") ON DELETE SET NULL,
  "contact_id"         uuid        NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "template_id"        uuid        NOT NULL REFERENCES "email_templates"("id") ON DELETE RESTRICT,
  "resend_message_id"  text,
  "status"             text        NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  "opened_at"          timestamptz,
  "clicked_at"         timestamptz,
  "sent_at"            timestamptz,
  "created_at"         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "email_sends" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "email_sends_tenant_id_idx"         ON "email_sends"("tenant_id");
CREATE INDEX "email_sends_contact_id_idx"        ON "email_sends"("contact_id");
CREATE INDEX "email_sends_resend_msg_id_idx"     ON "email_sends"("resend_message_id")
  WHERE "resend_message_id" IS NOT NULL;
