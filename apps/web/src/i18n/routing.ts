import { defineRouting } from "next-intl/routing";

// MVP default: English. DE and FR are present for future switch — do NOT remove them.
// When ready, set defaultLocale to "de" (DE-CH beachhead) or "fr" (Swiss French).
export const routing = defineRouting({
  locales: ["en", "de", "fr"],
  defaultLocale: "en",
});
