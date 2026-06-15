-- Migration 0013: Add conversation thread columns to social_posts.
-- thread_id links all refinements of the same original post.
-- parent_job_id points to the post being refined.

ALTER TABLE "social_posts"
  ADD COLUMN IF NOT EXISTS "thread_id" uuid,
  ADD COLUMN IF NOT EXISTS "parent_job_id" uuid,
  ADD COLUMN IF NOT EXISTS "refinement_instruction" text;

-- Backfill: existing posts are each their own thread root.
UPDATE "social_posts" SET "thread_id" = "id" WHERE "thread_id" IS NULL;

CREATE INDEX IF NOT EXISTS "social_posts_thread_id_idx"
  ON "social_posts" ("thread_id");
