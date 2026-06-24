ALTER TYPE usage_metric ADD VALUE IF NOT EXISTS 'sms_sent';
ALTER TYPE usage_metric ADD VALUE IF NOT EXISTS 'sms_segments';

DO $$
BEGIN
  CREATE TYPE sms_phone_verification_status AS ENUM ('pending', 'verified', 'expired', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sms_phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  status sms_phone_verification_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  resend_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_phone_verifications_tenant_idx
  ON sms_phone_verifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_phone_verifications_phone_idx
  ON sms_phone_verifications (tenant_id, phone);

ALTER TABLE sms_phone_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_phone_verifications_tenant_isolation ON sms_phone_verifications;
CREATE POLICY sms_phone_verifications_tenant_isolation ON sms_phone_verifications
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
