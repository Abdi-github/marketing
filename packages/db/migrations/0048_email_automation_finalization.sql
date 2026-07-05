-- Email automation finalization: compliance metadata, send tracking, and
-- duplicate-send protection.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'transactional',
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS consent_required boolean NOT NULL DEFAULT false;

ALTER TABLE email_templates
  DROP CONSTRAINT IF EXISTS email_templates_purpose_check;

ALTER TABLE email_templates
  ADD CONSTRAINT email_templates_purpose_check
  CHECK (purpose IN ('transactional', 'marketing'));

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'transactional',
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS consent_required boolean NOT NULL DEFAULT false;

ALTER TABLE email_sequences
  DROP CONSTRAINT IF EXISTS email_sequences_purpose_check;

ALTER TABLE email_sequences
  ADD CONSTRAINT email_sequences_purpose_check
  CHECK (purpose IN ('transactional', 'marketing'));

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS step_index integer,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE email_sends
  DROP CONSTRAINT IF EXISTS email_sends_status_check;

ALTER TABLE email_sends
  ADD CONSTRAINT email_sends_status_check
  CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS email_sends_tenant_idempotency_unique
  ON email_sends (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE email_sending_domains
  ADD COLUMN IF NOT EXISTS provider_domain_id text,
  ADD COLUMN IF NOT EXISTS tracking_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS provider_region text;
