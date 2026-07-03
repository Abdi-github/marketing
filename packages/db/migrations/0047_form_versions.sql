CREATE TABLE IF NOT EXISTS form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  schema jsonb NOT NULL,
  steps jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  submit_label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_versions_tenant_id_idx
  ON form_versions (tenant_id);
CREATE INDEX IF NOT EXISTS form_versions_form_id_idx
  ON form_versions (form_id);
CREATE UNIQUE INDEX IF NOT EXISTS form_versions_form_version_unique
  ON form_versions (form_id, version);

ALTER TABLE form_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_versions_tenant_isolation ON form_versions;
CREATE POLICY form_versions_tenant_isolation ON form_versions
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
