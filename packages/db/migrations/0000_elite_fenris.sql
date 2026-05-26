CREATE TABLE IF NOT EXISTS "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);

-- ─── Hand-edited: RLS + CI coverage view ─────────────────────────────────────
-- tenants and feature_flags are system tables — they intentionally skip RLS.
-- All future tenant-owned tables must add the block below (see add-tenant-table skill).

-- Set the session variable drizzle-kit uses for tenant isolation.
-- App code must call: SET app.current_tenant = '<uuid>' before any tenant query.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_settings WHERE name = 'app.current_tenant'
  ) THEN
    PERFORM set_config('app.current_tenant', '', false);
  END IF;
END $$;

-- CI smoke-test view: any public table NOT in the exclusion list must have rowsecurity = true.
CREATE OR REPLACE VIEW _rls_coverage AS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('tenants', 'feature_flags', '_rls_coverage');
