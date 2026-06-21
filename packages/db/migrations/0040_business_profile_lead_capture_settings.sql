ALTER TABLE business_profiles
ADD COLUMN IF NOT EXISTS lead_capture_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
