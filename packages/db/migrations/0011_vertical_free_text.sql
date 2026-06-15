-- Migration 0011: replace business_vertical enum with free text.
-- Allows any SME type (web agency, tattoo studio, etc.) not just the 3 beachhead verticals.

ALTER TABLE "business_profiles" ALTER COLUMN "vertical" TYPE text;

DROP TYPE IF EXISTS "business_vertical";
