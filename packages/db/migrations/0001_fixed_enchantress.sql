CREATE TYPE "public"."business_vertical" AS ENUM('restaurant', 'cafe', 'fitness_studio');--> statement-breakpoint
CREATE TYPE "public"."tenant_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"active_tenant_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"platform_role" text,
	"locale" text DEFAULT 'de-CH' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vertical" "business_vertical" NOT NULL,
	"locale" text DEFAULT 'de-CH' NOT NULL,
	"business_name" text NOT NULL,
	"address_street" text,
	"address_city" text,
	"address_postal_code" text,
	"address_country" text DEFAULT 'CH' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_users" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "tenant_role" DEFAULT 'editor' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_users_pk" PRIMARY KEY ("tenant_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_processed" (
	"event_id" uuid NOT NULL,
	"handler_name" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_processed_pk" PRIMARY KEY ("event_id", "handler_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"publish_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "outbox_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_tenant_id_tenants_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_profiles_tenant_id_idx" ON "business_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_users_tenant_id_idx" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_unpublished_idx" ON "outbox" USING btree ("id") WHERE "outbox"."published_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_tenant_idx" ON "outbox" USING btree ("tenant_id");

-- ─── Hand-edited: RLS for tenant-scoped tables (add-tenant-table skill) ───────
-- business_profiles and tenant_users carry tenant_id — both get RLS.
-- Auth tables (users, sessions, accounts, verifications) are NOT tenant-scoped.
-- Outbox and event_processed are operator infrastructure — no RLS.

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_profiles_tenant_isolation ON business_profiles
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_users_tenant_isolation ON tenant_users
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Update the CI smoke-test view to exclude auth and infra tables.
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
