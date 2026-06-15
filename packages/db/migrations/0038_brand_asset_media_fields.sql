ALTER TABLE brand_assets
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS social_preview_url text;
