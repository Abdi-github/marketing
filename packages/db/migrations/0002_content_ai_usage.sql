CREATE TYPE "public"."social_post_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"prompt_input" jsonb NOT NULL,
	"generated_text" text,
	"status" "social_post_status" DEFAULT 'pending' NOT NULL,
	"ai_usage_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenant_id_tenants_id_fk"
   FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_tenant_id_tenants_id_fk"
   FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_ai_usage_id_ai_usage_id_fk"
   FOREIGN KEY ("ai_usage_id") REFERENCES "public"."ai_usage"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_usage_tenant_id_idx" ON "ai_usage" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_job_id_unique" ON "ai_usage" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_tenant_id_idx" ON "social_posts" USING btree ("tenant_id");--> statement-breakpoint

-- ─── Hand-edited: RLS for tenant-scoped tables (add-tenant-table skill) ───────

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_tenant_isolation ON ai_usage
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_posts_tenant_isolation ON social_posts
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Update the _rls_coverage view to include new tables.
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
