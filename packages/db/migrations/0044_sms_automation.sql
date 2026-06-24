ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'twilio';
ALTER TYPE message_status ADD VALUE IF NOT EXISTS 'undelivered';

CREATE TABLE IF NOT EXISTS sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  body text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  category text NOT NULL DEFAULT 'custom',
  preset_key text,
  is_transactional boolean NOT NULL DEFAULT false,
  ai_drafted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_event text NOT NULL DEFAULT 'manual',
  trigger_filter jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'paused'
    CHECK (status IN ('active', 'paused', 'archived')),
  category text NOT NULL DEFAULT 'custom',
  preset_key text,
  steps jsonb NOT NULL DEFAULT '[]',
  daily_cap integer NOT NULL DEFAULT 100 CHECK (daily_cap > 0),
  quiet_hours_start text NOT NULL DEFAULT '20:00',
  quiet_hours_end text NOT NULL DEFAULT '08:00',
  timezone text NOT NULL DEFAULT 'Europe/Zurich',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES sms_sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'paused', 'completed', 'exited', 'suppressed', 'failed')),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_id)
);

CREATE TABLE IF NOT EXISTS sms_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'opted_out')),
  source text NOT NULL DEFAULT 'system',
  consent_source_url text,
  consent_captured_at timestamptz,
  consent_meta jsonb NOT NULL DEFAULT '{}',
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS sms_automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  idempotency_key text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error_message text,
  cost_budget_cents integer NOT NULL DEFAULT 30,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS sms_templates_tenant_idx
  ON sms_templates (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_sequences_tenant_idx
  ON sms_sequences (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_sequence_enrollments_tenant_idx
  ON sms_sequence_enrollments (tenant_id);
CREATE INDEX IF NOT EXISTS sms_sequence_enrollments_due_idx
  ON sms_sequence_enrollments (status, next_run_at);
CREATE INDEX IF NOT EXISTS sms_preferences_tenant_contact_idx
  ON sms_preferences (tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS sms_automation_jobs_tenant_idx
  ON sms_automation_jobs (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS messages_sms_external_id_unique
  ON messages (external_id)
  WHERE channel = 'sms' AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS messages_sms_sequence_step_unique
  ON messages ((meta->>'enrollmentId'), (meta->>'stepIndex'))
  WHERE channel = 'sms' AND meta ? 'enrollmentId';

ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_templates_tenant_isolation ON sms_templates
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
CREATE POLICY sms_sequences_tenant_isolation ON sms_sequences
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
CREATE POLICY sms_sequence_enrollments_tenant_isolation ON sms_sequence_enrollments
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
CREATE POLICY sms_preferences_tenant_isolation ON sms_preferences
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
CREATE POLICY sms_automation_jobs_tenant_isolation ON sms_automation_jobs
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
