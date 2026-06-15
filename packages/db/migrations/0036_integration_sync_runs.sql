-- Integration sync history and worker handoff.
-- Manual "Sync now" requests should enqueue worker jobs and store status here.

CREATE TYPE "public"."integration_sync_status" AS ENUM (
  'queued',
  'running',
  'success',
  'partial',
  'noop',
  'error'
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "integration_sync_runs" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL,
  "connection_id"       uuid NOT NULL,
  "provider"            "integration_provider" NOT NULL,
  "external_account_id" text NOT NULL DEFAULT 'default',
  "status"              "integration_sync_status" NOT NULL DEFAULT 'queued',
  "source"              text NOT NULL DEFAULT 'manual',
  "records_processed"   integer NOT NULL DEFAULT 0,
  "error_message"       text,
  "started_at"          timestamp with time zone,
  "completed_at"        timestamp with time zone,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"          timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "integration_sync_runs"
  ADD CONSTRAINT "integration_sync_runs_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "integration_sync_runs"
  ADD CONSTRAINT "integration_sync_runs_connection_id_fk"
  FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "integration_sync_runs_tenant_id_idx"
  ON "integration_sync_runs" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "integration_sync_runs_connection_created_idx"
  ON "integration_sync_runs" USING btree ("connection_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "integration_sync_runs_provider_created_idx"
  ON "integration_sync_runs" USING btree ("tenant_id", "provider", "created_at");
--> statement-breakpoint

ALTER TABLE "integration_sync_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "integration_sync_runs_tenant_isolation"
  ON "integration_sync_runs"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
--> statement-breakpoint
