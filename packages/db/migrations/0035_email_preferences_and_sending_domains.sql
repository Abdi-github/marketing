-- Email preference center and tenant sending-domain verification.

CREATE TABLE email_preferences (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id              uuid        REFERENCES contacts(id) ON DELETE SET NULL,
  email                   text        NOT NULL,
  marketing_opt_in        boolean     NOT NULL DEFAULT true,
  source                  text        NOT NULL DEFAULT 'system',
  locale                  text,
  updated_from_ip         text,
  updated_from_user_agent text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_preferences_tenant_id_idx ON email_preferences (tenant_id);
CREATE INDEX email_preferences_contact_id_idx ON email_preferences (tenant_id, contact_id);
CREATE UNIQUE INDEX email_preferences_tenant_email_unique
  ON email_preferences (tenant_id, email);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_preferences_tenant_isolation ON email_preferences
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE email_sending_domains (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain               text        NOT NULL,
  status               text        NOT NULL DEFAULT 'pending_verification'
                         CHECK (status IN ('pending_verification', 'verified', 'failed')),
  verify_token         text        NOT NULL,
  from_name            text        NOT NULL DEFAULT 'MarketingAI CH',
  from_local_part      text        NOT NULL DEFAULT 'hello',
  is_primary           boolean     NOT NULL DEFAULT false,
  verified_at          timestamptz,
  last_dns_check_at    timestamptz,
  last_dns_check_error text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_sending_domains_tenant_id_idx ON email_sending_domains (tenant_id);
CREATE UNIQUE INDEX email_sending_domains_domain_unique ON email_sending_domains (domain);
CREATE INDEX email_sending_domains_tenant_primary_idx
  ON email_sending_domains (tenant_id, is_primary);

ALTER TABLE email_sending_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_sending_domains_tenant_isolation ON email_sending_domains
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
