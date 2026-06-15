// Section variant registry — drives the layout AI's variant picking and the renderer's component dispatch.
// Each section type has 3-5 named variants. The layout prompt is shown this registry so it picks valid keys.
// Renderers (LP-3) import this to know which component to load per (type, variant) pair.

export const SECTION_VARIANTS = {
  hero: [
    "centered",
    "split-image-right",
    "image-bg-overlay",
    "split-form-right",
    "editorial-bold",
    "gradient-spotlight",
  ],
  about: ["text-image-split", "team-grid", "values-3col"],
  menu_preview: ["list-borders", "cards-grid", "split-image"],
  offer: ["banner-centered", "split-image-price", "countdown-bold"],
  gallery: ["masonry-3", "grid-2x2", "carousel-strip", "feature-side"],
  testimonials: ["cards-3col", "large-quote", "list-with-avatars", "marquee"],
  faq: ["accordion", "two-column", "numbered-list"],
  contact: ["split-map", "cards-row", "full-map-overlay"],
  lead_form: ["card-centered", "split-side-image", "full-width-bar"],
  whatsapp_cta: ["centered-button", "banner-strip"],
} as const;

export type SectionType = keyof typeof SECTION_VARIANTS;
export type SectionVariantKey<T extends SectionType> = (typeof SECTION_VARIANTS)[T][number];
export type AnyVariantKey = SectionVariantKey<SectionType>;

/** Default variant per type — used as fallback when a composition is missing a `variant` field (pre-LP-1 data). */
export const DEFAULT_VARIANT: Record<SectionType, string> = {
  hero: "centered",
  about: "text-image-split",
  menu_preview: "list-borders",
  offer: "banner-centered",
  gallery: "masonry-3",
  testimonials: "cards-3col",
  faq: "accordion",
  contact: "split-map",
  lead_form: "card-centered",
  whatsapp_cta: "centered-button",
};

/** Validate at runtime whether a variant key is allowed for a section type. */
export function isValidVariant(type: SectionType, variant: string): boolean {
  return (SECTION_VARIANTS[type] as readonly string[]).includes(variant);
}

/** Normalize: returns the variant if valid, else the default for that type. */
export function normalizeVariant(type: SectionType, variant: string | undefined | null): string {
  if (variant && isValidVariant(type, variant)) return variant;
  return DEFAULT_VARIANT[type];
}

/** Get all variant keys (flat) — used by AI prompt context generation. */
export function describeVariantsForPrompt(): string {
  const lines: string[] = [];
  for (const [type, variants] of Object.entries(SECTION_VARIANTS)) {
    lines.push(`- ${type}: ${(variants as readonly string[]).join(" | ")}`);
  }
  return lines.join("\n");
}
