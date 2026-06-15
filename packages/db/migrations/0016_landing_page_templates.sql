-- step-21: Platform-wide landing page template catalog.
-- Not tenant-scoped — no RLS. Templates are created by the platform, not by tenants.
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "landing_page_vertical" AS ENUM (
    'cafe', 'restaurant', 'fitness', 'clinic', 'retail', 'service', 'generic'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "landing_page_style" AS ENUM (
    'minimal', 'bold', 'elegant', 'playful'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_page_templates" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key"                 text NOT NULL,
  "name_key"            text NOT NULL,
  "description_key"     text NOT NULL,
  "vertical"            "landing_page_vertical" NOT NULL DEFAULT 'generic',
  "style"               "landing_page_style" NOT NULL DEFAULT 'minimal',
  "default_sections"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "default_brand_hints" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "screenshot_url"      text,
  "is_active"           boolean NOT NULL DEFAULT true,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lp_templates_key_unique" ON "landing_page_templates" ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_templates_vertical_idx" ON "landing_page_templates" ("vertical") WHERE "is_active" = true;
--> statement-breakpoint

-- ─── Seed: 12 templates (4 verticals × 3 styles) ─────────────────────────────
INSERT INTO "landing_page_templates"
  ("key", "name_key", "description_key", "vertical", "style", "default_sections", "default_brand_hints")
VALUES
  -- ── Café ──────────────────────────────────────────────────────────────────
  ('cafe-minimal',
   'cafe_minimal_name', 'cafe_minimal_desc',
   'cafe', 'minimal',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"menu_preview","order":2},{"type":"lead_form","order":3}]',
   '{"tone":"warm and welcoming","colorHint":"warm neutrals and espresso browns"}'),

  ('cafe-bold',
   'cafe_bold_name', 'cafe_bold_desc',
   'cafe', 'bold',
   '[{"type":"hero","order":0},{"type":"offer","order":1},{"type":"menu_preview","order":2},{"type":"testimonials","order":3},{"type":"lead_form","order":4}]',
   '{"tone":"energetic and vibrant","colorHint":"rich browns and warm yellows"}'),

  ('cafe-elegant',
   'cafe_elegant_name', 'cafe_elegant_desc',
   'cafe', 'elegant',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"menu_preview","order":2},{"type":"gallery","order":3},{"type":"lead_form","order":4}]',
   '{"tone":"refined and sophisticated","colorHint":"dark greens and gold"}'),

  -- ── Restaurant ────────────────────────────────────────────────────────────
  ('restaurant-minimal',
   'restaurant_minimal_name', 'restaurant_minimal_desc',
   'restaurant', 'minimal',
   '[{"type":"hero","order":0},{"type":"menu_preview","order":1},{"type":"contact","order":2},{"type":"lead_form","order":3}]',
   '{"tone":"straightforward and appetizing","colorHint":"clean whites and deep reds"}'),

  ('restaurant-bold',
   'restaurant_bold_name', 'restaurant_bold_desc',
   'restaurant', 'bold',
   '[{"type":"hero","order":0},{"type":"offer","order":1},{"type":"menu_preview","order":2},{"type":"testimonials","order":3},{"type":"contact","order":4},{"type":"lead_form","order":5}]',
   '{"tone":"passionate and indulgent","colorHint":"deep burgundy and gold"}'),

  ('restaurant-elegant',
   'restaurant_elegant_name', 'restaurant_elegant_desc',
   'restaurant', 'elegant',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"menu_preview","order":2},{"type":"gallery","order":3},{"type":"contact","order":4},{"type":"lead_form","order":5}]',
   '{"tone":"sophisticated and curated","colorHint":"ivory and charcoal"}'),

  -- ── Fitness ───────────────────────────────────────────────────────────────
  ('fitness-minimal',
   'fitness_minimal_name', 'fitness_minimal_desc',
   'fitness', 'minimal',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"offer","order":2},{"type":"lead_form","order":3}]',
   '{"tone":"clear and motivating","colorHint":"clean whites and blacks"}'),

  ('fitness-bold',
   'fitness_bold_name', 'fitness_bold_desc',
   'fitness', 'bold',
   '[{"type":"hero","order":0},{"type":"offer","order":1},{"type":"testimonials","order":2},{"type":"faq","order":3},{"type":"lead_form","order":4}]',
   '{"tone":"energetic and challenging","colorHint":"bold blacks and vibrant orange"}'),

  ('fitness-elegant',
   'fitness_elegant_name', 'fitness_elegant_desc',
   'fitness', 'elegant',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"offer","order":2},{"type":"gallery","order":3},{"type":"lead_form","order":4}]',
   '{"tone":"holistic and refined","colorHint":"sage greens and warm beige"}'),

  -- ── Generic (any business) ────────────────────────────────────────────────
  ('generic-minimal',
   'generic_minimal_name', 'generic_minimal_desc',
   'generic', 'minimal',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"offer","order":2},{"type":"lead_form","order":3}]',
   '{"tone":"professional and clear","colorHint":"clean blues and whites"}'),

  ('generic-bold',
   'generic_bold_name', 'generic_bold_desc',
   'generic', 'bold',
   '[{"type":"hero","order":0},{"type":"offer","order":1},{"type":"testimonials","order":2},{"type":"faq","order":3},{"type":"lead_form","order":4}]',
   '{"tone":"confident and impactful","colorHint":"strong contrasts"}'),

  ('generic-elegant',
   'generic_elegant_name', 'generic_elegant_desc',
   'generic', 'elegant',
   '[{"type":"hero","order":0},{"type":"about","order":1},{"type":"offer","order":2},{"type":"gallery","order":3},{"type":"contact","order":4},{"type":"lead_form","order":5}]',
   '{"tone":"polished and trustworthy","colorHint":"navy and silver"}')

ON CONFLICT ("key") DO NOTHING;
