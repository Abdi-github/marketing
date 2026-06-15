-- step-28: contact segments for AI-driven segmentation + bulk actions.
-- rule_json stores a typed AND/OR leaf tree:
--   { "op": "and"|"or", "children": [{ "field", "op", "value" }, ...] }
-- Rule evaluation happens at query time in the tRPC router (no materialised
-- membership table at MVP — computed on demand for ≤500 contacts per tenant).

CREATE TABLE segments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,
  rule_json   JSONB NOT NULL DEFAULT '{"op":"and","children":[]}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX segments_tenant_idx ON segments (tenant_id);

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY segments_tenant_isolation ON segments
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
