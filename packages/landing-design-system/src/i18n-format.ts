// Swiss locale-aware formatters used by public landing pages and previews.

export type SwissLocale = "de-CH" | "fr-CH" | "it-CH" | "en";

export function isSwissLocale(value: string): value is SwissLocale {
  return value === "de-CH" || value === "fr-CH" || value === "it-CH" || value === "en";
}

export function formatPriceCHF(amount: number, locale: SwissLocale = "de-CH"): string {
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  const wholeStr = whole
    .toLocaleString(locale === "en" ? "en-CH" : locale, {
      useGrouping: true,
    })
    .replace(/,/g, "'");

  if (rest === 0) {
    switch (locale) {
      case "de-CH":
      case "fr-CH":
        return `CHF ${wholeStr}.-`;
      case "it-CH":
        return `CHF ${wholeStr}.-`;
      case "en":
        return `CHF ${wholeStr}`;
    }
  }

  return `CHF ${wholeStr}.${String(rest).padStart(2, "0")}`;
}

export function formatPhoneCH(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return input;

  let normalized = digits;
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (normalized.startsWith("0")) normalized = "41" + normalized.slice(1);
  if (!normalized.startsWith("41")) normalized = "41" + normalized;

  if (normalized.length < 11) return input;

  const cc = normalized.slice(0, 2);
  const area = normalized.slice(2, 4);
  const block1 = normalized.slice(4, 7);
  const block2 = normalized.slice(7, 9);
  const block3 = normalized.slice(9, 11);

  return `+${cc} ${area} ${block1} ${block2} ${block3}`;
}

export function formatDateCH(
  date: Date | string,
  locale: SwissLocale = "de-CH",
  opts: { withYear?: boolean } = {},
): string {
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return String(date);

  const intlLocale = locale === "en" ? "en-CH" : locale;
  const includesYear = opts.withYear !== false;

  return parsed.toLocaleDateString(intlLocale, {
    day: "numeric",
    month: "long",
    year: includesYear ? "numeric" : undefined,
  });
}

export function formatDateTimeCH(date: Date | string, locale: SwissLocale = "de-CH"): string {
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return String(date);

  const intlLocale = locale === "en" ? "en-CH" : locale;
  return parsed.toLocaleString(intlLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  });
}

export type SwissAddress = {
  street: string;
  zip: string;
  city: string;
  canton?: string;
};

export function formatAddressCH(address: SwissAddress): string {
  const cantonSuffix = address.canton ? ` (${address.canton})` : "";
  return `${address.street}, ${address.zip} ${address.city}${cantonSuffix}`;
}

export function parsePriceCHF(input: string): number {
  const cleaned = input
    .replace(/CHF|Fr\.|Sfr\.|\s/g, "")
    .replace(/'/g, "")
    .replace(/[–-]$/, "0")
    .replace(/,/g, ".");

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}
