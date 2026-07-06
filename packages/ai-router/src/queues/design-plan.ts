import type { Vibe } from "./design-recipe";
import type { SectionType } from "./landing-page.schema";

export type DesignArchetype =
  | "conversion-split"
  | "editorial-showcase"
  | "boutique-story"
  | "menu-magazine"
  | "trust-first"
  | "kinetic-launch"
  | "calm-service"
  | "premium-local"
  | "bold-agency"
  | "property-showcase"
  | "clinic-trust"
  | "event-spotlight"
  | "premium-minimal";

export type HeroTreatment =
  | "image-overlay"
  | "split-media"
  | "centered-statement"
  | "form-first"
  | "editorial-headline"
  | "gradient-spotlight";

export type NavStyle = "classic" | "compact-cta" | "editorial" | "bold-pill";
export type MotionStyle = "quiet" | "soft-reveal" | "kinetic" | "carousel-forward";
export type Density = "airy" | "balanced" | "dense";
export type ImageDirection =
  | "curated-local"
  | "editorial-people"
  | "product-detail"
  | "ambient-space"
  | "ai-hero"
  | "property-showcase"
  | "portfolio-proof"
  | "clinical-calm"
  | "venue-atmosphere";
export type SectionTopology =
  | "story-first"
  | "conversion-first"
  | "proof-first"
  | "catalog-first"
  | "service-brochure";

export type StyleEra = "classic" | "balanced" | "modern";
export type RhythmStyle = "quiet-trust" | "balanced-contrast" | "kinetic-contrast";

export type StyleContract = {
  era: StyleEra;
  navStyle: NavStyle;
  heroVariants: string[];
  sectionOrder: SectionType[];
  variantPools: Partial<Record<SectionType, string[]>>;
  palettePool: string[];
  fontPairPool: string[];
  rhythmStyle: RhythmStyle;
  spacing: "compact" | "balanced" | "editorial";
  motionStyle: MotionStyle;
};

export type LandingPageDesignPlan = {
  subvertical: string;
  archetype: DesignArchetype;
  conversionGoal: string;
  sectionTopology: SectionTopology;
  heroTreatment: HeroTreatment;
  navStyle: NavStyle;
  motionStyle: MotionStyle;
  density: Density;
  imageDirection: ImageDirection;
  styleContract: StyleContract;
  uniquenessSeed: string;
  uniquenessFingerprint: string;
};

export type DesignPlanInput = {
  tenantId: string;
  landingPageId: string;
  businessName: string;
  vertical: string;
  city?: string | null;
  locale: string;
  userPrompt?: string | null;
  goals?: string[] | null;
  vibe?: Partial<Vibe> | null;
  imageStrategy?: string | null;
  templateKey?: string | null;
};

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shortHash(input: string): string {
  const a = hash32(input).toString(16).padStart(8, "0");
  const b = hash32(`${input}|design-plan`).toString(16).padStart(8, "0");
  return `${a}${b}`.slice(0, 12);
}

function bucket(seed: string, salt: string, size: number): number {
  return hash32(`${seed}|${salt}`) % size;
}

function pick<T>(items: readonly T[], seed: string, salt: string): T {
  return items[bucket(seed, salt, items.length)]!;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSearch(value: string | null | undefined): string {
  return normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe");
}

type SearchContext = {
  text: string;
  tokens: Set<string>;
  verticalTokens: Set<string>;
};

function createSearchContext(vertical: string, prompt: string): SearchContext {
  const verticalText = normalizeSearch(vertical);
  const text = `${verticalText} ${normalizeSearch(prompt)}`;
  return {
    text,
    tokens: new Set(text.match(/[a-z0-9]+/g) ?? []),
    verticalTokens: new Set(verticalText.match(/[a-z0-9]+/g) ?? []),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasToken(ctx: SearchContext, values: readonly string[]): boolean {
  return values.some((value) => ctx.tokens.has(value));
}

function hasVerticalToken(ctx: SearchContext, values: readonly string[]): boolean {
  return values.some((value) => ctx.verticalTokens.has(value));
}

function hasPhrase(ctx: SearchContext, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => {
    const normalized = normalizeSearch(phrase);
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`).test(ctx.text);
  });
}

function classifySubvertical(vertical: string, prompt: string): string {
  const ctx = createSearchContext(vertical, prompt);

  const realEstate =
    hasPhrase(ctx, [
      "real estate",
      "estate agency",
      "property agency",
      "property management",
      "agence immobiliere",
      "immobilien makler",
      "immobilienagentur",
      "agente immobiliare",
    ]) || hasToken(ctx, ["realtor", "property", "properties", "immobilier", "immobilien", "immo"]);
  if (realEstate) {
    const luxury =
      hasToken(ctx, ["luxury", "luxe", "premium", "villa", "penthouse", "estate", "boutique"]) ||
      hasPhrase(ctx, ["high end", "high-end", "lake view", "private estate"]);
    return luxury ? "real-estate-luxury" : "real-estate-residential";
  }

  const software =
    hasToken(ctx, ["saas", "software", "platform", "app", "apps", "ai", "startup", "tech"]) ||
    hasPhrase(ctx, ["web app", "mobile app", "b2b software", "software company"]);
  if (software) return "software-saas";

  const digitalAgency =
    hasPhrase(ctx, [
      "web design",
      "web agency",
      "digital agency",
      "marketing agency",
      "creative agency",
      "branding studio",
      "design studio",
      "seo agency",
      "website agency",
    ]) ||
    (hasToken(ctx, ["agency", "studio"]) &&
      hasToken(ctx, ["web", "website", "websites", "brand", "branding", "design", "digital"]));
  if (digitalAgency) return "agency-digital";

  if (hasToken(ctx, ["bakery", "boulangerie", "patisserie", "pastry", "brunch"]))
    return "cafe-bakery";
  if (hasToken(ctx, ["cafe", "coffee", "barista", "kaffee"])) return "cafe-specialty";
  if (hasToken(ctx, ["pizza", "trattoria", "italian", "ristorante"])) return "restaurant-italian";
  if (hasToken(ctx, ["restaurant", "bistro", "brasserie", "dining", "gastro"]))
    return "restaurant-local";

  const eventVenue =
    hasPhrase(ctx, ["event venue", "wedding venue", "conference venue", "private events"]) ||
    hasToken(ctx, ["venue", "wedding", "events", "event", "conference", "banquet"]);
  if (
    eventVenue &&
    (hasVerticalToken(ctx, ["event", "events", "venue", "wedding"]) ||
      !hasToken(ctx, ["restaurant", "cafe", "bistro"]))
  ) {
    return "event-venue";
  }

  if (hasToken(ctx, ["yoga", "pilates", "wellness", "spa"])) return "fitness-wellness";
  if (hasToken(ctx, ["gym", "fitness", "crossfit", "training", "sport"]))
    return "fitness-performance";
  if (hasToken(ctx, ["dental", "dentist", "zahnarzt"])) return "clinic-dental";
  if (hasToken(ctx, ["clinic", "doctor", "arzt", "medecin", "physio", "osteo", "health", "praxis"]))
    return "clinic-trust";

  if (
    hasToken(ctx, [
      "electrician",
      "plumber",
      "roofer",
      "carpenter",
      "painter",
      "cleaning",
      "hvac",
      "handyman",
      "renovation",
      "repair",
      "solar",
    ])
  ) {
    return "local-trades";
  }

  if (hasToken(ctx, ["fashion", "mode", "clothing", "boutique"])) return "retail-fashion";
  if (hasToken(ctx, ["jewel", "jewelry", "watch", "artisan", "maker", "atelier"]))
    return "retail-artisan";
  if (hasToken(ctx, ["agency", "consult", "consulting", "coach", "studio", "service"]))
    return "service-professional";
  return (
    normalize(vertical)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "local-business"
  );
}

function defaultGoal(subvertical: string): string {
  if (subvertical.startsWith("restaurant") || subvertical.startsWith("cafe"))
    return "info_brochure";
  if (subvertical.startsWith("event")) return "event_signup";
  if (subvertical.startsWith("real-estate")) return "lead_capture";
  if (subvertical.startsWith("clinic") || subvertical.startsWith("fitness"))
    return "appointment_booking";
  if (subvertical.startsWith("retail")) return "sales_promo";
  return "lead_capture";
}

function chooseArchetype(input: {
  subvertical: string;
  goal: string;
  vibe: Vibe;
  seed: string;
}): DesignArchetype {
  const pool: DesignArchetype[] = [];
  if (input.subvertical === "agency-digital" || input.subvertical === "software-saas") {
    pool.push("bold-agency", "premium-minimal", "kinetic-launch");
  }
  if (input.subvertical.startsWith("real-estate")) {
    pool.push("property-showcase", "premium-minimal", "trust-first");
  }
  if (input.subvertical.startsWith("clinic")) {
    pool.push("clinic-trust", "trust-first", "calm-service");
  }
  if (input.subvertical === "event-venue") {
    pool.push("event-spotlight", "premium-local", "editorial-showcase");
  }
  if (input.subvertical === "local-trades") {
    pool.push("conversion-split", "trust-first", "calm-service");
  }
  if (input.goal === "lead_capture" || input.goal === "appointment_booking") {
    pool.push("conversion-split", "trust-first", "calm-service");
  }
  if (input.goal === "sales_promo" || input.goal === "event_signup") {
    pool.push("kinetic-launch", "conversion-split", "premium-local");
  }
  if (input.subvertical.startsWith("restaurant") || input.subvertical.startsWith("cafe")) {
    pool.push("menu-magazine", "editorial-showcase", "boutique-story");
  }
  if (input.subvertical.startsWith("retail")) {
    pool.push("boutique-story", "editorial-showcase", "premium-local");
  }
  if (input.vibe.classicModern > 0.35) pool.push("editorial-showcase", "kinetic-launch");
  if (input.vibe.calmEnergetic < -0.35) pool.push("calm-service", "trust-first");
  if (input.vibe.minimalBold > 0.35) pool.push("kinetic-launch", "premium-local");
  return pick(
    pool.length ? pool : ["premium-local", "calm-service", "boutique-story"],
    input.seed,
    "archetype",
  );
}

function chooseHeroTreatment(
  archetype: DesignArchetype,
  goal: string,
  seed: string,
): HeroTreatment {
  if (archetype === "bold-agency") {
    return pick(["gradient-spotlight", "editorial-headline", "split-media"], seed, "hero");
  }
  if (archetype === "property-showcase") {
    return pick(["image-overlay", "split-media", "editorial-headline"], seed, "hero");
  }
  if (archetype === "clinic-trust") {
    return pick(["form-first", "split-media", "centered-statement"], seed, "hero");
  }
  if (archetype === "event-spotlight") {
    return pick(["image-overlay", "gradient-spotlight", "split-media"], seed, "hero");
  }
  if (archetype === "premium-minimal") {
    return pick(["centered-statement", "split-media", "editorial-headline"], seed, "hero");
  }
  if (goal === "lead_capture" || goal === "appointment_booking") {
    return pick(["form-first", "split-media", "image-overlay"], seed, "hero");
  }
  if (archetype === "editorial-showcase" || archetype === "boutique-story") {
    return pick(["editorial-headline", "split-media", "image-overlay"], seed, "hero");
  }
  if (archetype === "kinetic-launch") {
    return pick(["gradient-spotlight", "image-overlay", "centered-statement"], seed, "hero");
  }
  return pick(["image-overlay", "split-media", "centered-statement"], seed, "hero");
}

function chooseStyleEra(vibe: Vibe): StyleEra {
  if (vibe.classicModern <= -0.35) return "classic";
  if (vibe.classicModern >= 0.35) return "modern";
  return "balanced";
}

type ContractInput = {
  era: StyleEra;
  subvertical: string;
  goal: string;
  archetype: DesignArchetype;
  vibe: Vibe;
  seed: string;
};

function isDigital(subvertical: string): boolean {
  return subvertical === "agency-digital" || subvertical === "software-saas";
}

function isProperty(subvertical: string): boolean {
  return subvertical.startsWith("real-estate");
}

function isClinic(subvertical: string): boolean {
  return subvertical.startsWith("clinic");
}

function isTrades(subvertical: string): boolean {
  return subvertical === "local-trades";
}

function isEventVenue(subvertical: string): boolean {
  return subvertical === "event-venue";
}

function isCatalogBusiness(subvertical: string): boolean {
  return (
    subvertical.startsWith("restaurant") ||
    subvertical.startsWith("cafe") ||
    subvertical.startsWith("retail")
  );
}

function sectionOrderFor(input: ContractInput, era: StyleEra): SectionType[] {
  if (isDigital(input.subvertical)) {
    return [
      "hero",
      "offer",
      "gallery",
      "testimonials",
      "about",
      "faq",
      "lead_form",
      "contact",
      "menu_preview",
      "whatsapp_cta",
    ];
  }
  if (isProperty(input.subvertical)) {
    return [
      "hero",
      "gallery",
      "offer",
      "testimonials",
      "about",
      "faq",
      "contact",
      "lead_form",
      "menu_preview",
      "whatsapp_cta",
    ];
  }
  if (isClinic(input.subvertical) || isTrades(input.subvertical)) {
    return [
      "hero",
      "about",
      "testimonials",
      "faq",
      "contact",
      "lead_form",
      "offer",
      "gallery",
      "menu_preview",
      "whatsapp_cta",
    ];
  }
  if (isEventVenue(input.subvertical)) {
    return [
      "hero",
      "gallery",
      "offer",
      "testimonials",
      "faq",
      "contact",
      "lead_form",
      "about",
      "menu_preview",
      "whatsapp_cta",
    ];
  }

  const catalogFirst = isCatalogBusiness(input.subvertical);
  if (era === "classic") {
    return catalogFirst
      ? [
          "hero",
          "about",
          "menu_preview",
          "gallery",
          "offer",
          "testimonials",
          "faq",
          "contact",
          "lead_form",
          "whatsapp_cta",
        ]
      : [
          "hero",
          "about",
          "offer",
          "menu_preview",
          "testimonials",
          "faq",
          "contact",
          "lead_form",
          "gallery",
          "whatsapp_cta",
        ];
  }
  if (era === "modern") {
    return catalogFirst
      ? [
          "hero",
          "gallery",
          "offer",
          "menu_preview",
          "testimonials",
          "about",
          "faq",
          "lead_form",
          "contact",
          "whatsapp_cta",
        ]
      : [
          "hero",
          "offer",
          "gallery",
          "testimonials",
          "about",
          "faq",
          "lead_form",
          "contact",
          "menu_preview",
          "whatsapp_cta",
        ];
  }
  return catalogFirst
    ? [
        "hero",
        "offer",
        "menu_preview",
        "gallery",
        "about",
        "testimonials",
        "faq",
        "contact",
        "lead_form",
        "whatsapp_cta",
      ]
    : [
        "hero",
        "offer",
        "about",
        "gallery",
        "testimonials",
        "faq",
        "contact",
        "lead_form",
        "menu_preview",
        "whatsapp_cta",
      ];
}

function heroVariantsFor(
  input: ContractInput,
  era: StyleEra,
  fallback: readonly string[],
): string[] {
  if (isDigital(input.subvertical)) {
    return era === "classic"
      ? ["split-image-right", "centered"]
      : ["agency-bento", "gradient-spotlight", "editorial-bold", "split-image-right"];
  }
  if (isProperty(input.subvertical)) {
    return era === "classic"
      ? ["split-image-right", "image-bg-overlay", "centered"]
      : ["property-showcase", "image-bg-overlay", "split-image-right", "editorial-bold"];
  }
  if (isClinic(input.subvertical)) {
    return ["clinic-trust", "split-form-right", "split-image-right", "centered"];
  }
  if (isTrades(input.subvertical)) {
    return ["split-form-right", "image-bg-overlay", "split-image-right"];
  }
  if (isEventVenue(input.subvertical)) {
    return era === "classic"
      ? ["image-bg-overlay", "split-image-right", "centered"]
      : ["image-bg-overlay", "gradient-spotlight", "split-image-right"];
  }
  return [...fallback];
}

function variantPoolsFor(
  input: ContractInput,
  base: Partial<Record<SectionType, string[]>>,
): Partial<Record<SectionType, string[]>> {
  if (isDigital(input.subvertical)) {
    return {
      ...base,
      hero: heroVariantsFor(input, input.era, base.hero ?? []),
      about: ["team-grid", "values-3col", "text-image-split"],
      offer: ["quote-path", "banner-centered", "countdown-bold", "split-image-price"],
      gallery: ["portfolio-bento", "feature-side", "carousel-strip", "masonry-3"],
      testimonials: ["marquee", "large-quote", "cards-3col"],
      faq: ["two-column", "numbered-list"],
      contact: ["cards-row", "split-map"],
      lead_form: ["consultation-panel", "full-width-bar", "split-side-image", "card-centered"],
    };
  }
  if (isProperty(input.subvertical)) {
    return {
      ...base,
      hero: heroVariantsFor(input, input.era, base.hero ?? []),
      about: ["values-3col", "text-image-split"],
      offer: ["quote-path", "split-image-price", "banner-centered"],
      gallery: ["portfolio-bento", "feature-side", "grid-2x2", "masonry-3"],
      testimonials: ["large-quote", "cards-3col"],
      faq: ["two-column", "accordion"],
      contact: ["split-map", "cards-row"],
      lead_form: ["consultation-panel", "split-side-image", "card-centered"],
    };
  }
  if (isClinic(input.subvertical)) {
    return {
      ...base,
      hero: heroVariantsFor(input, input.era, base.hero ?? []),
      about: ["trust-proof", "team-grid", "values-3col", "text-image-split"],
      offer: ["quote-path", "banner-centered", "split-image-price"],
      gallery: ["feature-side", "grid-2x2"],
      testimonials: ["list-with-avatars", "cards-3col", "large-quote"],
      faq: ["accordion", "two-column"],
      contact: ["cards-row", "split-map"],
      lead_form: ["consultation-panel", "card-centered", "split-side-image"],
    };
  }
  if (isTrades(input.subvertical)) {
    return {
      ...base,
      hero: heroVariantsFor(input, input.era, base.hero ?? []),
      offer: ["quote-path", "banner-centered", "split-image-price"],
      about: ["trust-proof", "values-3col", "text-image-split"],
      testimonials: ["cards-3col", "list-with-avatars"],
      faq: ["numbered-list", "accordion"],
      contact: ["cards-row", "split-map"],
      lead_form: ["consultation-panel", "full-width-bar", "card-centered", "split-side-image"],
    };
  }
  if (isEventVenue(input.subvertical)) {
    return {
      ...base,
      hero: heroVariantsFor(input, input.era, base.hero ?? []),
      offer: ["countdown-bold", "banner-centered"],
      gallery: ["carousel-strip", "masonry-3", "feature-side"],
      testimonials: ["large-quote", "marquee", "cards-3col"],
      faq: ["two-column", "accordion"],
      contact: ["split-map", "cards-row"],
      lead_form: ["full-width-bar", "split-side-image"],
    };
  }
  return base;
}

function themePoolFor(input: ContractInput, fallback: readonly string[]): string[] {
  if (input.subvertical === "agency-digital") {
    return ["vercel-mono", "clean-slate", "sky-startup", "modern-minimal", "graphite-mono"];
  }
  if (input.subvertical === "software-saas") {
    return ["clean-slate", "sky-startup", "vercel-mono", "indigo-trust", "modern-minimal"];
  }
  if (input.subvertical === "real-estate-luxury") {
    return [
      "elegant-luxury",
      "midnight-luxe",
      "champagne-soft",
      "graphite-mono",
      "geneve-elegance",
    ];
  }
  if (input.subvertical === "real-estate-residential") {
    return ["graphite-mono", "ocean-breeze", "clean-slate", "alpine-clean", "elegant-luxury"];
  }
  if (isClinic(input.subvertical)) {
    return ["mint-clinic", "ocean-breeze", "sage-garden", "nature", "alpine-clean", "graphite-pro"];
  }
  if (isTrades(input.subvertical)) {
    return ["clean-slate", "graphite-pro", "zurich-modern", "amber-slate", "alpine-clean"];
  }
  if (isEventVenue(input.subvertical)) {
    return ["solar-dusk", "elegant-luxury", "burgundy-velvet", "champagne-soft", "rose-blush"];
  }
  return [...fallback];
}

function fontPoolFor(input: ContractInput, fallback: readonly string[]): string[] {
  if (input.subvertical === "agency-digital" || input.subvertical === "software-saas") {
    return ["inter-inter", "manrope-inter", "space-grotesk-inter", "archivo-inter"];
  }
  if (isProperty(input.subvertical)) {
    return ["playfair-inter", "manrope-inter", "fraunces-inter", "inter-inter"];
  }
  if (isClinic(input.subvertical) || isTrades(input.subvertical)) {
    return ["manrope-inter", "inter-inter", "ibm-plex-source-serif"];
  }
  if (isEventVenue(input.subvertical)) {
    return ["playfair-lora", "fraunces-inter", "dm-serif-dm-sans", "playfair-inter"];
  }
  return [...fallback];
}

function navStyleFor(input: ContractInput, fallback: NavStyle): NavStyle {
  if (input.era === "classic") return "classic";
  if (isClinic(input.subvertical) || isTrades(input.subvertical)) return "compact-cta";
  if (isProperty(input.subvertical)) return "editorial";
  if (isDigital(input.subvertical) || isEventVenue(input.subvertical)) {
    return input.vibe.calmEnergetic > 0.35 || input.vibe.minimalBold > 0.35
      ? "bold-pill"
      : "editorial";
  }
  return fallback;
}

function styleContractFor(input: {
  era: StyleEra;
  subvertical: string;
  goal: string;
  archetype: DesignArchetype;
  vibe: Vibe;
  seed: string;
}): StyleContract {
  if (input.era === "classic") {
    const heroVariants = heroVariantsFor(
      input,
      "classic",
      input.goal === "lead_capture" || input.goal === "appointment_booking"
        ? ["split-image-right", "centered", "split-form-right"]
        : ["centered", "split-image-right", "image-bg-overlay"],
    );
    return {
      era: "classic",
      navStyle: navStyleFor(input, "classic"),
      heroVariants,
      sectionOrder: sectionOrderFor(input, "classic"),
      variantPools: variantPoolsFor(input, {
        hero: ["centered", "split-image-right"],
        about: ["text-image-split", "values-3col"],
        menu_preview: ["list-borders", "split-image"],
        offer: ["split-image-price", "banner-centered"],
        gallery: ["grid-2x2", "masonry-3"],
        testimonials: ["large-quote", "cards-3col"],
        faq: ["accordion", "two-column"],
        contact: ["split-map", "cards-row"],
        lead_form: ["card-centered", "split-side-image"],
      }),
      palettePool: themePoolFor(input, [
        "alpine-clean",
        "geneve-elegance",
        "bern-heritage",
        "graphite-pro",
        "champagne-soft",
        "forest-calm",
      ]),
      fontPairPool: fontPoolFor(input, [
        "playfair-inter",
        "fraunces-inter",
        "playfair-lora",
        "ibm-plex-source-serif",
      ]),
      rhythmStyle: "quiet-trust",
      spacing: "compact",
      motionStyle: "quiet",
    };
  }

  if (input.era === "modern") {
    const fallbackHeroVariants =
      input.archetype === "editorial-showcase" || input.archetype === "boutique-story"
        ? ["editorial-bold", "image-bg-overlay", "gradient-spotlight"]
        : input.goal === "lead_capture" || input.goal === "appointment_booking"
          ? ["editorial-bold", "gradient-spotlight", "split-form-right"]
          : ["editorial-bold", "gradient-spotlight", "image-bg-overlay"];
    const heroVariants = heroVariantsFor(input, "modern", fallbackHeroVariants);
    return {
      era: "modern",
      navStyle: navStyleFor(
        input,
        input.archetype === "kinetic-launch" ||
          input.vibe.minimalBold > 0.35 ||
          input.vibe.calmEnergetic > 0.35
          ? "bold-pill"
          : "editorial",
      ),
      heroVariants,
      sectionOrder: sectionOrderFor(input, "modern"),
      variantPools: variantPoolsFor(input, {
        hero: ["editorial-bold", "gradient-spotlight", "image-bg-overlay"],
        about: ["team-grid", "values-3col"],
        menu_preview: ["cards-grid", "split-image"],
        offer: ["countdown-bold", "banner-centered"],
        gallery: ["carousel-strip", "feature-side", "masonry-3"],
        testimonials: ["marquee", "large-quote"],
        faq: ["numbered-list", "two-column"],
        contact: ["cards-row", "split-map"],
        lead_form: ["full-width-bar", "split-side-image"],
        whatsapp_cta: ["banner-strip"],
      }),
      palettePool: themePoolFor(input, [
        "violet-noir",
        "monochrome-bold",
        "midnight-emerald",
        "electric-lime",
        "fuchsia-bold",
        "neon-pulse",
      ]),
      fontPairPool: fontPoolFor(input, [
        "space-grotesk-inter",
        "archivo-inter",
        "bebas-inter",
        "manrope-inter",
      ]),
      rhythmStyle: "kinetic-contrast",
      spacing: "editorial",
      motionStyle: input.vibe.calmEnergetic > 0.25 ? "kinetic" : "carousel-forward",
    };
  }

  const fallbackHeroVariants =
    input.goal === "lead_capture" || input.goal === "appointment_booking"
      ? ["split-form-right", "image-bg-overlay", "split-image-right"]
      : ["image-bg-overlay", "split-image-right", "centered"];
  const heroVariants = heroVariantsFor(input, "balanced", fallbackHeroVariants);
  return {
    era: "balanced",
    navStyle: navStyleFor(input, "compact-cta"),
    heroVariants,
    sectionOrder: sectionOrderFor(input, "balanced"),
    variantPools: variantPoolsFor(input, {
      hero: ["split-form-right", "image-bg-overlay", "split-image-right"],
      about: ["values-3col", "text-image-split", "team-grid"],
      menu_preview: ["cards-grid", "list-borders", "split-image"],
      offer: ["banner-centered", "split-image-price", "countdown-bold"],
      gallery: ["feature-side", "masonry-3", "carousel-strip"],
      testimonials: ["cards-3col", "list-with-avatars", "large-quote"],
      faq: ["two-column", "accordion", "numbered-list"],
      contact: ["cards-row", "split-map"],
      lead_form: ["split-side-image", "card-centered", "full-width-bar"],
    }),
    palettePool: themePoolFor(input, [
      "zurich-modern",
      "ocean-fresh",
      "warm-roasted",
      "sage-wellness",
      "rose-blush",
      "graphite-pro",
    ]),
    fontPairPool: fontPoolFor(input, [
      "manrope-inter",
      "inter-inter",
      "dm-serif-dm-sans",
      "fraunces-inter",
    ]),
    rhythmStyle: "balanced-contrast",
    spacing: "balanced",
    motionStyle:
      input.vibe.calmEnergetic > 0.35
        ? "soft-reveal"
        : pick(["soft-reveal", "quiet"], input.seed, "balanced-motion"),
  };
}

function chooseTopology(
  archetype: DesignArchetype,
  goal: string,
  subvertical: string,
  seed: string,
): SectionTopology {
  if (subvertical === "agency-digital" || subvertical === "software-saas") {
    return pick(["conversion-first", "proof-first", "service-brochure"], seed, "topology");
  }
  if (subvertical.startsWith("real-estate") || subvertical === "event-venue") {
    return pick(["catalog-first", "proof-first", "story-first"], seed, "topology");
  }
  if (subvertical.startsWith("clinic") || subvertical === "local-trades") {
    return pick(["proof-first", "conversion-first", "service-brochure"], seed, "topology");
  }
  if (
    subvertical.startsWith("restaurant") ||
    subvertical.startsWith("cafe") ||
    subvertical.startsWith("retail")
  ) {
    return pick(["catalog-first", "story-first", "proof-first"], seed, "topology");
  }
  if (goal === "lead_capture" || goal === "appointment_booking") {
    return pick(["conversion-first", "proof-first", "service-brochure"], seed, "topology");
  }
  if (archetype === "trust-first") return "proof-first";
  if (archetype === "boutique-story") return "story-first";
  return pick(["story-first", "conversion-first", "service-brochure"], seed, "topology");
}

export function createLandingPageDesignPlan(input: DesignPlanInput): LandingPageDesignPlan {
  const goals = input.goals?.filter(Boolean) ?? [];
  const vibe: Vibe = {
    minimalBold: input.vibe?.minimalBold ?? 0,
    classicModern: input.vibe?.classicModern ?? 0,
    calmEnergetic: input.vibe?.calmEnergetic ?? 0,
  };
  const seedBasis = JSON.stringify({
    tenantId: input.tenantId,
    landingPageId: input.landingPageId,
    businessName: input.businessName,
    vertical: input.vertical,
    city: input.city ?? "",
    locale: input.locale,
    goals,
    vibe,
    templateKey: input.templateKey ?? "",
    promptSignal: normalize(input.userPrompt).slice(0, 280),
  });
  const uniquenessFingerprint = shortHash(seedBasis);
  const uniquenessSeed = `${input.landingPageId}:${uniquenessFingerprint}`;
  const subvertical = classifySubvertical(input.vertical, input.userPrompt ?? "");
  const conversionGoal = goals[0] ?? defaultGoal(subvertical);
  const archetype = chooseArchetype({
    subvertical,
    goal: conversionGoal,
    vibe,
    seed: uniquenessSeed,
  });
  const sectionTopology = chooseTopology(archetype, conversionGoal, subvertical, uniquenessSeed);
  const heroTreatment = chooseHeroTreatment(archetype, conversionGoal, uniquenessSeed);
  const styleContract = styleContractFor({
    era: chooseStyleEra(vibe),
    subvertical,
    goal: conversionGoal,
    archetype,
    vibe,
    seed: uniquenessSeed,
  });
  const navStyle: NavStyle = styleContract.navStyle;
  const motionStyle: MotionStyle = styleContract.motionStyle;
  const density: Density =
    styleContract.era === "classic"
      ? "airy"
      : styleContract.era === "modern"
        ? conversionGoal === "sales_promo" || conversionGoal === "event_signup"
          ? "dense"
          : "balanced"
        : "balanced";
  const imageDirection: ImageDirection = (() => {
    if (input.imageStrategy === "ai") return "ai-hero";
    if (subvertical.startsWith("real-estate")) return "property-showcase";
    if (subvertical === "agency-digital" || subvertical === "software-saas")
      return "portfolio-proof";
    if (subvertical.startsWith("clinic")) return "clinical-calm";
    if (subvertical === "event-venue") return "venue-atmosphere";
    if (subvertical.startsWith("retail")) return "product-detail";
    if (archetype === "editorial-showcase" || archetype === "boutique-story")
      return "editorial-people";
    if (archetype === "calm-service") return "ambient-space";
    return "curated-local";
  })();

  return {
    subvertical,
    archetype,
    conversionGoal,
    sectionTopology,
    heroTreatment,
    navStyle,
    motionStyle,
    density,
    imageDirection,
    styleContract,
    uniquenessSeed,
    uniquenessFingerprint,
  };
}

export function designPlanSeed(plan: LandingPageDesignPlan): string {
  return [
    plan.uniquenessSeed,
    plan.archetype,
    plan.sectionTopology,
    plan.heroTreatment,
    plan.navStyle,
    plan.motionStyle,
    plan.imageDirection,
  ].join("|");
}
