-- step-32+: Custom domains
-- Lets a tenant claim multiple hostnames and have their landing pages render
-- at those hostnames (e.g., cafebern.ch) instead of /p/<tenant-slug>/<page-slug>.

-- ─── domain_status enum ──────────────────────────────────────────────────────
-- Lifecycle:
--   pending_verification → verified → cert_pending → live
--   any state → failed (with last_error populated)
--   any state → removed (soft delete preserves history)
CREATE TYPE domain_status AS ENUM (
  'pending_verification',
  'verified',
  'cert_pending',
  'live',
  'failed',
  'removed'
);

-- ─── custom_domains ──────────────────────────────────────────────────────────
CREATE TABLE custom_domains (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  -- Hostname must be globally unique — no two tenants can claim the same domain.
  -- Lowercased on insert (CITEXT or trigger could enforce; we lowercase in app code).
  hostname                TEXT NOT NULL UNIQUE,
  -- Random token the tenant adds to a TXT record to prove ownership.
  verify_token            TEXT NOT NULL,
  status                  domain_status NOT NULL DEFAULT 'pending_verification',
  cert_issued_at          TIMESTAMPTZ,
  cert_expires_at         TIMESTAMPTZ,
  last_dns_check_at       TIMESTAMPTZ,
  last_dns_check_error    TEXT,
  -- When set, makes this the tenant's default hostname for canonical URLs
  -- (used in shareable links + SEO canonical tag). At most one per tenant
  -- should have this set; not enforced at DB level because the app layer
  -- handles the "promote" mutation atomically.
  is_primary              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for middleware hostname → tenant lookup (very hot path).
CREATE INDEX custom_domains_hostname_status_idx
  ON custom_domains(hostname)
  WHERE status = 'live';

-- Index for the dashboard "my domains" list.
CREATE INDEX custom_domains_tenant_idx ON custom_domains(tenant_id);

-- Index for the cert-renewal worker (scan domains with certs expiring within 14d).
CREATE INDEX custom_domains_cert_expires_idx
  ON custom_domains(cert_expires_at)
  WHERE status = 'live' AND cert_expires_at IS NOT NULL;

-- RLS — same pattern as every other tenant-owned table (ADR-0001).
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON custom_domains
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
