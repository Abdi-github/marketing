import { defineRouting } from "next-intl/routing";

// Locale expansion order per ADR-0014 D2: DE-CH (default) → FR-CH (GA) → IT-CH (step-17).
// DE/AT expansion remains deferred to Phase 9+.
export const routing = defineRouting({
  locales: ["en", "de", "fr", "it"],
  defaultLocale: "en",
});
