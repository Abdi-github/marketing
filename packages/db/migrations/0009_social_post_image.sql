-- step-19: add image_url to social_posts
-- Nullable: existing rows have no image; new rows populate after FLUX generation.
ALTER TABLE "social_posts" ADD COLUMN "image_url" text;
