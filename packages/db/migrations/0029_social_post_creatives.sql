-- Migration 0029: Persist designed social creative metadata and stored PNG URLs.

ALTER TABLE "social_posts"
  ADD COLUMN IF NOT EXISTS "creative_plan" jsonb,
  ADD COLUMN IF NOT EXISTS "creative_template" text,
  ADD COLUMN IF NOT EXISTS "creative_aspect_ratio" text,
  ADD COLUMN IF NOT EXISTS "creative_image_url" text,
  ADD COLUMN IF NOT EXISTS "creative_storage_key" text,
  ADD COLUMN IF NOT EXISTS "creative_status" text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS "creative_error" text,
  ADD COLUMN IF NOT EXISTS "creative_updated_at" timestamptz;
