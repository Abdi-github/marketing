export const LANDING_PAGE_LOCALES = [
  {
    key: "de-CH",
    flag: "CH",
    shortLabel: "DE",
    label: "Deutsch (Schweiz)",
    description: "Swiss German-facing High German, CHF, Swiss spelling.",
  },
  {
    key: "fr-CH",
    flag: "CH",
    shortLabel: "FR",
    label: "Francais (Suisse)",
    description: "Swiss Romandy French, CHF, polite form.",
  },
  {
    key: "it-CH",
    flag: "CH",
    shortLabel: "IT",
    label: "Italiano (Svizzera)",
    description: "Swiss Italian, CHF, polite Lei form.",
  },
  {
    key: "en",
    flag: "INT",
    shortLabel: "EN",
    label: "English",
    description: "Neutral international English, CHF.",
  },
] as const;

export type LandingPageLocale = (typeof LANDING_PAGE_LOCALES)[number]["key"];

export type LandingLanguagePreferences = {
  locales: LandingPageLocale[];
  defaultLocale: LandingPageLocale;
};

export const LANDING_PAGE_LOCALE_KEYS = LANDING_PAGE_LOCALES.map(
  (locale) => locale.key,
) as LandingPageLocale[];

export function isLandingPageLocale(value: unknown): value is LandingPageLocale {
  return (
    typeof value === "string" && (LANDING_PAGE_LOCALE_KEYS as readonly string[]).includes(value)
  );
}

export function landingLanguageLabel(locale: string): string {
  return LANDING_PAGE_LOCALES.find((item) => item.key === locale)?.label ?? locale;
}

export function landingLanguageShortLabel(locale: string): string {
  return (
    LANDING_PAGE_LOCALES.find((item) => item.key === locale)?.shortLabel ?? locale.toUpperCase()
  );
}

export function normalizeLandingLanguagePreferences(
  value: unknown,
  fallbackLocale: string = "de-CH",
): LandingLanguagePreferences {
  const fallback = isLandingPageLocale(fallbackLocale) ? fallbackLocale : "de-CH";
  const raw = value as { locales?: unknown[]; defaultLocale?: unknown } | null | undefined;
  const locales = Array.from(
    new Set(
      (raw?.locales ?? [])
        .filter(isLandingPageLocale)
        .concat(isLandingPageLocale(raw?.defaultLocale) ? [raw.defaultLocale] : []),
    ),
  );
  if (locales.length === 0) locales.push(fallback);
  const defaultLocale = locales.includes(raw?.defaultLocale as LandingPageLocale)
    ? (raw?.defaultLocale as LandingPageLocale)
    : locales.includes(fallback)
      ? fallback
      : locales[0]!;
  return { locales, defaultLocale };
}
