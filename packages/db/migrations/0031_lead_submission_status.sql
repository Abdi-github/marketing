-- step-33: operational lead submission statuses for the forms inbox.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_status_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_status_check
      CHECK (status IN ('new', 'contacted', 'qualified', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_tenant_form_status_idx
  ON leads (tenant_id, form_id, status);
