-- Migration 0004: Landing pages + leads tables (step-12 / Phase 6)
-- Creates: landing_pages, landing_page_versions, landing_page_views,
--          forms, leads, brand_embeddings
-- Enables: pgvector extension
-- RLS: all tables tenant-scoped

-- Note: pgvector extension is intentionally NOT required here.
-- brand_embeddings.embedding is stored as JSONB (float array) at MVP.
-- Phase 7 will ALTER the column to vector(1536) once the production Postgres
-- has pgvector installed. See ADR-0012 and docs/ROADMAP.md §Phase 7.

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "public"."landing_page_status" AS ENUM(
  'draft', 'published', 'unpublished', 'failed'
);--> statement-breakpoint

CREATE TYPE "public"."brand_context_type" AS ENUM(
  'about', 'menu', 'offer', 'faq'
);--> statement-breakpoint

-- ─── landing_pages ────────────────────────────────────────────────────────────
-- step_data JSONB stores intermediate AI-step outputs (brief/copy/layout).
-- current_version_id FK added after landing_page_versions is created.
CREATE TABLE IF NOT EXISTS "landing_pages" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL,
  "slug"                text NOT NULL,
  "title"               text NOT NULL,
  "current_version_id"  uuid,
  "status"              "landing_page_status" NOT NULL DEFAULT 'draft',
  "published_at"        timestamp with time zone,
  "step_data"           jsonb NOT NULL DEFAULT '{}',
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "landing_pages"
  ADD CONSTRAINT "landing_pages_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "landing_pages_tenant_id_idx"
  ON "landing_pages" USING btree ("tenant_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "landing_pages_tenant_slug_unique"
  ON "landing_pages" USING btree ("tenant_id", "slug");
--> statement-breakpoint

-- ─── landing_page_versions ────────────────────────────────────────────────────
-- Immutable. Each publish inserts a new row.
CREATE TABLE IF NOT EXISTS "landing_page_versions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "landing_page_id"  uuid NOT NULL,
  "tenant_id"        uuid NOT NULL,
  "version"          integer NOT NULL,
  "composition"      jsonb NOT NULL,
  "created_by"       uuid,
  "ai_usage_id"      uuid,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "landing_page_versions"
  ADD CONSTRAINT "landing_page_versions_landing_page_id_fk"
  FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "landing_page_versions"
  ADD CONSTRAINT "landing_page_versions_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "landing_page_versions"
  ADD CONSTRAINT "landing_page_versions_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint

ALTER TABLE "landing_page_versions"
  ADD CONSTRAINT "landing_page_versions_ai_usage_id_fk"
  FOREIGN KEY ("ai_usage_id") REFERENCES "public"."ai_usage"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "landing_page_versions_tenant_id_idx"
  ON "landing_page_versions" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "landing_page_versions_page_id_idx"
  ON "landing_page_versions" USING btree ("landing_page_id");
--> statement-breakpoint

-- Now safe to add the circular FK on landing_pages.current_version_id.
ALTER TABLE "landing_pages"
  ADD CONSTRAINT "landing_pages_current_version_id_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "public"."landing_page_versions"("id") ON DELETE set null;
--> statement-breakpoint

-- ─── landing_page_views ───────────────────────────────────────────────────────
-- Append-only analytics. One row per public page load.
CREATE TABLE IF NOT EXISTS "landing_page_views" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid NOT NULL,
  "landing_page_id"  uuid NOT NULL,
  "version"          integer NOT NULL,
  "referrer"         text,
  "country_code"     text,
  "viewed_at"        timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "landing_page_views"
  ADD CONSTRAINT "landing_page_views_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "landing_page_views"
  ADD CONSTRAINT "landing_page_views_landing_page_id_fk"
  FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "landing_page_views_tenant_id_idx"
  ON "landing_page_views" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "landing_page_views_page_id_idx"
  ON "landing_page_views" USING btree ("landing_page_id");
--> statement-breakpoint

-- ─── forms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "forms" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid NOT NULL,
  "name"             text NOT NULL,
  "slug"             text NOT NULL,
  "schema"           jsonb NOT NULL,
  "landing_page_id"  uuid,
  "is_active"        boolean NOT NULL DEFAULT true,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"       timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "forms"
  ADD CONSTRAINT "forms_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "forms"
  ADD CONSTRAINT "forms_landing_page_id_fk"
  FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "forms_tenant_id_idx"
  ON "forms" USING btree ("tenant_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "forms_tenant_slug_unique"
  ON "forms" USING btree ("tenant_id", "slug");
--> statement-breakpoint

-- ─── leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leads" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL,
  "form_id"      uuid NOT NULL,
  "payload"      jsonb NOT NULL,
  "source_url"   text,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "contact_id"   uuid
);--> statement-breakpoint

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_form_id_forms_id_fk"
  FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE restrict;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "leads_tenant_id_idx"
  ON "leads" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "leads_form_id_idx"
  ON "leads" USING btree ("form_id");
--> statement-breakpoint

-- ─── brand_embeddings ────────────────────────────────────────────────────────
-- pgvector store for tenant brand context (similarity retrieval during copy step).
-- Index tuning and backfill deferred to Phase 7.
CREATE TABLE IF NOT EXISTS "brand_embeddings" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL,
  "content_type"  "brand_context_type" NOT NULL,
  "content_text"  text NOT NULL,
  "content_hash"  text NOT NULL,
  "embedding"     jsonb,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "brand_embeddings"
  ADD CONSTRAINT "brand_embeddings_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "brand_embeddings_tenant_id_idx"
  ON "brand_embeddings" USING btree ("tenant_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "brand_embeddings_tenant_hash_unique"
  ON "brand_embeddings" USING btree ("tenant_id", "content_hash");
--> statement-breakpoint

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY landing_pages_tenant_isolation ON landing_pages
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE landing_page_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY landing_page_versions_tenant_isolation ON landing_page_versions
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE landing_page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY landing_page_views_tenant_isolation ON landing_page_views
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY forms_tenant_isolation ON forms
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_tenant_isolation ON leads
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE brand_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_embeddings_tenant_isolation ON brand_embeddings
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- ─── Update _rls_coverage view ────────────────────────────────────────────────
CREATE OR REPLACE VIEW _rls_coverage AS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    'tenants', 'feature_flags',
    'users', 'sessions', 'accounts', 'verifications',
    'outbox', 'event_processed',
    '_rls_coverage'
  );
