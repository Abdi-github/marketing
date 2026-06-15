-- step-22: SEO fields + publishedVersionId on landing_pages.
-- published_version_id tracks what is LIVE on the public URL, separate from
-- current_version_id which is the editor's working draft. This separation lets
-- the editor save drafts without overwriting the live page.
--> statement-breakpoint
ALTER TABLE "landing_pages"
  ADD COLUMN IF NOT EXISTS "published_version_id" uuid,
  ADD COLUMN IF NOT EXISTS "meta_title"           text,
  ADD COLUMN IF NOT EXISTS "meta_description"     text,
  ADD COLUMN IF NOT EXISTS "og_image_url"         text,
  ADD COLUMN IF NOT EXISTS "noindex"              boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Back-fill: existing published pages get published_version_id = current_version_id.
UPDATE "landing_pages"
SET "published_version_id" = "current_version_id"
WHERE "status" = 'published'
  AND "current_version_id" IS NOT NULL
  AND "published_version_id" IS NULL;
