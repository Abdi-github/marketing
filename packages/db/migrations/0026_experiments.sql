-- step-31: A/B testing + conversion analytics

-- Extend event_type enum with form_submit (used for conversion counting in experiments).
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'form_submit';

-- ─── experiment_status enum ────────────────────────────────────────────────────
CREATE TYPE experiment_status AS ENUM ('running', 'stopped', 'complete');

-- ─── landing_page_experiments ─────────────────────────────────────────────────
CREATE TABLE landing_page_experiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  page_id         UUID NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          experiment_status NOT NULL DEFAULT 'running',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  winner_version_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX exp_tenant_page_idx ON landing_page_experiments(tenant_id, page_id);

ALTER TABLE landing_page_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON landing_page_experiments
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- ─── experiment_variants ──────────────────────────────────────────────────────
CREATE TABLE experiment_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES landing_page_experiments(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  version_id      UUID NOT NULL REFERENCES landing_page_versions(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT 'Variant',
  traffic_pct     INTEGER NOT NULL DEFAULT 50
    CONSTRAINT traffic_pct_range CHECK (traffic_pct >= 0 AND traffic_pct <= 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX exp_variants_experiment_idx ON experiment_variants(experiment_id);

ALTER TABLE experiment_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON experiment_variants
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
