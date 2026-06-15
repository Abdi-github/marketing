-- CRM tasks and follow-ups.
-- Manual reminders linked to contacts, optionally tied to a deal.

CREATE TABLE crm_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id   uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id      uuid        REFERENCES deals(id) ON DELETE SET NULL,
  title        text        NOT NULL,
  body         text,
  due_at       timestamptz,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  priority     text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_tasks_tenant_id_idx ON crm_tasks (tenant_id);
CREATE INDEX crm_tasks_contact_id_idx ON crm_tasks (contact_id);
CREATE INDEX crm_tasks_tenant_status_due_idx ON crm_tasks (tenant_id, status, due_at);

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_tasks_tenant_isolation ON crm_tasks
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
