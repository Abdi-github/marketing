-- Allow reservation workflows to mark a lead as confirmed.
-- The TypeScript LeadStatus type already includes this state; this migration
-- brings the database check constraint into alignment.

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'confirmed', 'qualified', 'archived'));
