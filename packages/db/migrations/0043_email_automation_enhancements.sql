-- Email automation enhancements: intent-aware sequence filters, AI job status,
-- send-kind visibility, preset metadata, and richer consent capture.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS preset_key text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'custom';

ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS preset_key text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'custom';

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS send_kind text NOT NULL DEFAULT 'sequence_step';

ALTER TABLE email_sends
  DROP CONSTRAINT IF EXISTS email_sends_send_kind_check;

ALTER TABLE email_sends
  ADD CONSTRAINT email_sends_send_kind_check
  CHECK (send_kind IN ('transactional_acknowledgement', 'sequence_step', 'template_test'));

ALTER TABLE email_preferences
  ADD COLUMN IF NOT EXISTS consent_source_url text,
  ADD COLUMN IF NOT EXISTS consent_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_meta jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS email_automation_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           uuid,
  job_kind          text        NOT NULL,
  status            text        NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  idempotency_key   text        NOT NULL,
  input             jsonb       NOT NULL DEFAULT '{}',
  result            jsonb,
  error_message     text,
  cost_budget_cents integer     NOT NULL DEFAULT 50,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS email_automation_jobs_tenant_idx
  ON email_automation_jobs (tenant_id, created_at DESC);

ALTER TABLE email_automation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_automation_jobs_tenant_isolation ON email_automation_jobs;
CREATE POLICY email_automation_jobs_tenant_isolation ON email_automation_jobs
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
