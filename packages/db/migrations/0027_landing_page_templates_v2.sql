-- LP-Phase 2: rich multilingual templates with theme, image bundle, goal, per-locale per-device screenshots.
-- Additive: existing rows continue working via default_sections (legacy). New rows populate sections_by_locale.
--> statement-breakpoint

-- New goal enum: what the landing page is meant to drive.
DO $$ BEGIN
  CREATE TYPE "landing_page_goal" AS ENUM (
    'lead_capture',
    'sales_promo',
    'event_signup',
    'appointment_booking',
    'info_brochure'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Add v2 columns to landing_page_templates.
-- Note: all new columns are NULLable or have defaults so existing rows pass validation.
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "sections_by_locale" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "available_locales" text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "theme_key" text;
--> statement-breakpoint
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "image_bundle_key" text;
--> statement-breakpoint
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "goal" "landing_page_goal" NOT NULL DEFAULT 'lead_capture';
--> statement-breakpoint
-- screenshot_urls_by_locale shape:
--   { "de-CH": { "phone": "...", "tablet": "...", "desktop": "..." }, "fr-CH": {...}, ... }
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "screenshot_urls_by_locale" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "landing_page_templates"
  ADD COLUMN IF NOT EXISTS "swiss_specific" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Indexes for the new filter dimensions.
CREATE INDEX IF NOT EXISTS "lp_templates_goal_idx"
  ON "landing_page_templates" ("goal") WHERE "is_active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_templates_swiss_idx"
  ON "landing_page_templates" ("swiss_specific") WHERE "is_active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_templates_theme_idx"
  ON "landing_page_templates" ("theme_key") WHERE "is_active" = true;
--> statement-breakpoint

-- Add theme_key to landing_pages so a published page knows which theme bundle to render.
-- NULLable: pre-LP-2 pages render with the default theme.
ALTER TABLE "landing_pages"
  ADD COLUMN IF NOT EXISTS "theme_key" text;
--> statement-breakpoint
-- Locale is stored in landing_page_versions.composition.locale today.
-- Add a denormalized column on landing_pages so we can filter without joining.
ALTER TABLE "landing_pages"
  ADD COLUMN IF NOT EXISTS "locale" text NOT NULL DEFAULT 'de-CH';
--> statement-breakpoint
