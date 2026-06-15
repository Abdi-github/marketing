-- step-29: WhatsApp Business + Swiss SMS messaging tables
-- ADR-0024: Meta Cloud API for WhatsApp; aspsms.ch for Swiss SMS

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE message_channel AS ENUM ('email', 'sms', 'whatsapp');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'read');
CREATE TYPE wa_template_status AS ENUM ('pending', 'approved', 'rejected');

-- ─── whatsapp_templates ───────────────────────────────────────────────────────

CREATE TABLE whatsapp_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  name           TEXT NOT NULL,
  language       TEXT NOT NULL DEFAULT 'de',
  body           TEXT NOT NULL,
  status         wa_template_status NOT NULL DEFAULT 'pending',
  external_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX whatsapp_templates_tenant_idx ON whatsapp_templates (tenant_id);
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_templates_tenant_isolation ON whatsapp_templates
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

-- ─── messages (unified inbox: email + sms + whatsapp) ────────────────────────

CREATE TABLE messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel        message_channel NOT NULL,
  direction      message_direction NOT NULL,
  from_address   TEXT NOT NULL,
  to_address     TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         message_status NOT NULL DEFAULT 'queued',
  external_id    TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_tenant_idx      ON messages (tenant_id);
CREATE INDEX messages_contact_idx     ON messages (contact_id);
CREATE INDEX messages_tenant_time_idx ON messages (tenant_id, occurred_at DESC);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_tenant_isolation ON messages
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
