-- Migration 0014: Meta / Facebook + Instagram publish tracking columns on social_posts

ALTER TABLE "social_posts"
  ADD COLUMN IF NOT EXISTS "meta_post_id" text,
  ADD COLUMN IF NOT EXISTS "ig_media_id" text,
  ADD COLUMN IF NOT EXISTS "published_to_meta_at" timestamptz;
