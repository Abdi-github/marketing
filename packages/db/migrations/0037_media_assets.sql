CREATE TABLE IF NOT EXISTS "media_assets" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"         uuid NOT NULL,
  "bucket"            text NOT NULL,
  "object_key"        text NOT NULL,
  "public_url"        text,
  "original_filename" text NOT NULL,
  "content_type"      text NOT NULL,
  "byte_size"         integer NOT NULL,
  "scope"             text NOT NULL,
  "visibility"        text NOT NULL DEFAULT 'public',
  "status"            text NOT NULL DEFAULT 'pending',
  "uploaded_at"       timestamp with time zone,
  "created_at"        timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"        timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "media_assets_tenant_id_idx"
  ON "media_assets" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "media_assets_tenant_scope_created_idx"
  ON "media_assets" USING btree ("tenant_id", "scope", "created_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_object_key_unique"
  ON "media_assets" USING btree ("object_key");
--> statement-breakpoint

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "media_assets_tenant_isolation"
  ON "media_assets"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
--> statement-breakpoint
