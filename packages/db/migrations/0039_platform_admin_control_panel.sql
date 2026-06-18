CREATE TYPE "public"."platform_audit_outcome" AS ENUM('success', 'failure');
CREATE TYPE "public"."support_session_status" AS ENUM('active', 'ended', 'expired');

CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid NOT NULL,
  "actor_platform_role" text,
  "tenant_id" uuid,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "outcome" "platform_audit_outcome" NOT NULL DEFAULT 'success',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "platform_audit_logs_actor_idx"
  ON "platform_audit_logs" USING btree ("actor_id");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_tenant_idx"
  ON "platform_audit_logs" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_action_idx"
  ON "platform_audit_logs" USING btree ("action", "created_at");

CREATE TABLE IF NOT EXISTS "support_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "reason" text,
  "status" "support_session_status" NOT NULL DEFAULT 'active',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "ended_at" timestamptz,
  "ended_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "support_sessions"
  ADD CONSTRAINT "support_sessions_actor_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "support_sessions"
  ADD CONSTRAINT "support_sessions_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "support_sessions_actor_idx"
  ON "support_sessions" USING btree ("actor_id", "started_at");
CREATE INDEX IF NOT EXISTS "support_sessions_tenant_idx"
  ON "support_sessions" USING btree ("tenant_id", "started_at");
CREATE INDEX IF NOT EXISTS "support_sessions_status_idx"
  ON "support_sessions" USING btree ("status", "started_at");

CREATE TABLE IF NOT EXISTS "tenant_support_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "kind" text NOT NULL DEFAULT 'general',
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "tenant_support_notes"
  ADD CONSTRAINT "tenant_support_notes_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "tenant_support_notes"
  ADD CONSTRAINT "tenant_support_notes_author_id_fk"
  FOREIGN KEY ("author_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "tenant_support_notes_tenant_idx"
  ON "tenant_support_notes" USING btree ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "tenant_support_notes_author_idx"
  ON "tenant_support_notes" USING btree ("author_id", "created_at");
