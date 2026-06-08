-- Migration 0006: GA — tenants suspension + FADP erasure (step-14 / Phase 8)
-- Adds: tenants.suspended (boolean, default false)
--       tenants.erased_at (timestamptz, nullable)
-- suspended: operators can block a tenant's AI job queue without deleting data.
-- erased_at: set when FADP hard-delete completes; tenant shell retained for audit trail.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "suspended" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "erased_at" timestamp with time zone;
--> statement-breakpoint
