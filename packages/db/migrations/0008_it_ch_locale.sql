-- Migration 0008: IT-CH locale expansion (step-17)
-- Introduces a locale_code enum to replace the unconstrained text locale column
-- on business_profiles. Accepted values: de-CH, fr-CH, it-CH.
-- Why an enum: rejects invalid locale strings at the DB layer without an app-level
-- CHECK constraint, and gives Drizzle a typed column.

CREATE TYPE "public"."locale_code" AS ENUM('de-CH', 'fr-CH', 'it-CH');
--> statement-breakpoint

-- Postgres cannot automatically cast a text DEFAULT to the new enum type during
-- ALTER COLUMN TYPE. The required 3-step pattern is:
--   1. DROP DEFAULT (removes the text default so the type change can proceed)
--   2. ALTER COLUMN TYPE with USING cast (rewrites all existing values)
--   3. SET DEFAULT as the new enum literal (restores the column default)
ALTER TABLE "business_profiles"
  ALTER COLUMN "locale" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "business_profiles"
  ALTER COLUMN "locale" TYPE "public"."locale_code"
  USING "locale"::"public"."locale_code";
--> statement-breakpoint

ALTER TABLE "business_profiles"
  ALTER COLUMN "locale" SET DEFAULT 'de-CH'::"public"."locale_code";
--> statement-breakpoint
