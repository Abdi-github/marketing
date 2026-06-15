-- step-24: Smart forms v1
-- Adds `steps` (multi-step field groups) and `settings` (anti-spam + UX config)
-- to the existing `forms` table. Backward-compatible: both columns are nullable.
-- If `steps` IS NULL the form falls back to the legacy `schema` column.

ALTER TABLE "forms"
  ADD COLUMN IF NOT EXISTS "steps" jsonb,
  ADD COLUMN IF NOT EXISTS "settings" jsonb NOT NULL DEFAULT '{"honeypot":true,"turnstile_enabled":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS "submit_label" text;
