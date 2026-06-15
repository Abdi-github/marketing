-- Email suppressions for unsubscribe, bounce, and complaint safety.

CREATE TABLE email_suppressions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id        uuid        REFERENCES contacts(id) ON DELETE SET NULL,
  email             text        NOT NULL,
  reason            text        NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'complained')),
  source            text        NOT NULL DEFAULT 'system',
  resend_event_type text,
  suppressed_at     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_suppressions_tenant_id_idx ON email_suppressions (tenant_id);
CREATE INDEX email_suppressions_contact_id_idx ON email_suppressions (tenant_id, contact_id);
CREATE UNIQUE INDEX email_suppressions_tenant_email_unique
  ON email_suppressions (tenant_id, email);

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_suppressions_tenant_isolation ON email_suppressions
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
