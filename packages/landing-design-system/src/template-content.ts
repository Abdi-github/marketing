// Template content model — used by `defineTemplate` helper in seed scripts.
// Mirrors the LandingPageComposition shape from @marketing/ai-router, but adds the
// per-locale multi-locale wrapper and template-level metadata (theme, image bundle, goal).
//
// This file is the SINGLE SOURCE of typed shape for human-authored templates.

import type { SwissLocale } from "./i18n-format";
import type { ThemeKey } from "./themes";
import type { ImageBundleKey } from "./unsplash-bundles";

export type TemplateGoal =
  | "lead_capture"
  | "sales_promo"
  | "event_signup"
  | "appointment_booking"
  | "info_brochure";

export type TemplateVertical =
  | "cafe" | "restaurant" | "fitness" | "clinic" | "retail" | "service";

export type TemplateStyle = "minimal" | "bold" | "elegant" | "playful";

// ─── Section extras (mirror @marketing/ai-router shape, locale-aware where needed) ──

export type SectionExtrasMap = {
  hero: {
    ctaText?: string;
    ctaHref?: string;
    backgroundImageUrl?: string;
  };
  about: {
    /** Main side image for the text-image-split variant. */
    imageUrl?: string;
    teamMembers?: Array<{ name: string; role?: string; photoUrl?: string }>;
  };
  menu_preview: {
    items?: Array<{ name: string; price?: string; description?: string }>;
  };
  offer: {
    price?: string;
    oldPrice?: string;
    validUntil?: string;
    ctaText?: string;
    ctaHref?: string;
  };
  gallery: {
    images?: Array<{ url: string; caption?: string }>;
  };
  testimonials: {
    items?: Array<{ quote: string; author: string; role?: string; avatarUrl?: string }>;
  };
  faq: {
    items?: Array<{ question: string; answer: string }>;
  };
  contact: {
    email?: string;
    phone?: string;
    address?: string;
    mapEmbedUrl?: string;
  };
  lead_form: Record<string, never>;
  whatsapp_cta: {
    phoneNumber?: string;
    prefillText?: string;
    buttonText?: string;
  };
};

export type SectionType = keyof SectionExtrasMap;

export type TemplateSection<T extends SectionType = SectionType> = {
  type: T;
  order: number;
  /** Section variant key (see SECTION_VARIANTS registry in @marketing/ai-router). */
  variant: string;
  heading: string;
  body?: string;
  extras?: SectionExtrasMap[T];
};

/** Per-locale sections — same shape array, only text differs per locale. */
export type SectionsByLocale = Partial<Record<SwissLocale, TemplateSection[]>>;

// ─── Template definition ────────────────────────────────────────────────────────

export type TemplateDefinition = {
  /** Stable key (e.g., "cafe-warm-roasted-elegant"). */
  key: string;
  /** Section structure (same across locales) — derived from the first locale entry's order/type/variant. */
  vertical: TemplateVertical;
  style: TemplateStyle;
  goal: TemplateGoal;
  /** Theme bundle key. */
  themeKey: ThemeKey;
  /** Image bundle key (for hero/gallery photos). */
  imageBundleKey: ImageBundleKey;
  /** True if the theme is one of the 5 Swiss-coded themes. */
  swissSpecific: boolean;
  /** Pre-filled, locale-keyed copy + extras. At least one locale required at definition; AI translates others later. */
  sectionsByLocale: SectionsByLocale;
  /** i18n keys for the gallery card name/description (in next-intl message files). */
  nameKey: string;
  descriptionKey: string;
  /** Reviewed locales (only these appear in production gallery; others show "Beta"). */
  availableLocales: readonly SwissLocale[];
};

// ─── Authoring helper ───────────────────────────────────────────────────────────

/**
 * Type-safe template builder. Validates that:
 * - At least one locale has sections defined
 * - All locales have the same section structure (same length, same types/variants/order)
 * - availableLocales only references defined locales
 */
export function defineTemplate(def: TemplateDefinition): TemplateDefinition {
  const localeKeys = Object.keys(def.sectionsByLocale) as SwissLocale[];
  if (localeKeys.length === 0) {
    throw new Error(`Template ${def.key}: must define at least one locale`);
  }

  // All locales must share identical structure (type, variant, order).
  const reference = def.sectionsByLocale[localeKeys[0]!]!;
  const refStructure = reference.map((s) => `${s.type}|${s.variant}|${s.order}`).join(",");
  for (const loc of localeKeys.slice(1)) {
    const sections = def.sectionsByLocale[loc]!;
    const structure = sections.map((s) => `${s.type}|${s.variant}|${s.order}`).join(",");
    if (structure !== refStructure) {
      throw new Error(
        `Template ${def.key}: locale ${loc} has different structure than ${localeKeys[0]}. ` +
          `All locales must share identical (type, variant, order) tuples.`,
      );
    }
  }

  // availableLocales must only reference defined locales.
  for (const loc of def.availableLocales) {
    if (!(loc in def.sectionsByLocale)) {
      throw new Error(`Template ${def.key}: availableLocales references undefined locale ${loc}`);
    }
  }

  return def;
}

/** Extract the section structure (type + variant + order) — used by AI translator + screenshot pipeline. */
export function getSectionStructure(def: TemplateDefinition): Array<{ type: SectionType; variant: string; order: number }> {
  const firstLocale = Object.keys(def.sectionsByLocale)[0] as SwissLocale | undefined;
  if (!firstLocale) return [];
  return def.sectionsByLocale[firstLocale]!.map((s) => ({
    type: s.type,
    variant: s.variant,
    order: s.order,
  }));
}
