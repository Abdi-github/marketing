-- step-22: Brand kit table — one row per tenant, RLS enforced.
-- Stores logo, brand colors, fonts, voice tone used by public pages and copy prompts.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_assets" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "logo_url"        text,
  "color_primary"   text NOT NULL DEFAULT '#111827',
  "color_secondary" text NOT NULL DEFAULT '#6b7280',
  "font_heading"    text NOT NULL DEFAULT 'system-ui',
  "font_body"       text NOT NULL DEFAULT 'system-ui',
  "voice_tone"      text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_assets_tenant_unique" ON "brand_assets" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "brand_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "brand_assets"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
