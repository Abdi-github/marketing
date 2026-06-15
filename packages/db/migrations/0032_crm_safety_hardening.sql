-- CRM safety hardening.
-- Deal tables already had RLS enabled in 0022_deals.sql; this migration adds
-- the missing tenant policies so Postgres enforces the same boundary as tRPC.

CREATE POLICY deal_stages_tenant_isolation ON deal_stages
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE POLICY deals_tenant_isolation ON deals
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE POLICY deal_activities_tenant_isolation ON deal_activities
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
