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
  | "premium-local";

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
  | "ai-hero";
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

function classifySubvertical(vertical: string, prompt: string): string {
  const text = `${normalize(vertical)} ${normalize(prompt)}`;
  if (/bakery|boulangerie|patisserie|pastry|brunch/.test(text)) return "cafe-bakery";
  if (/cafe|coffee|barista|kaffee/.test(text)) return "cafe-specialty";
  if (/pizza|trattoria|italian|ristorante/.test(text)) return "restaurant-italian";
  if (/restaurant|bistro|brasserie|dining|gastro/.test(text)) return "restaurant-local";
  if (/yoga|pilates|wellness|spa/.test(text)) return "fitness-wellness";
  if (/gym|fitness|crossfit|training|sport/.test(text)) return "fitness-performance";
  if (/dental|dentist|zahnarzt/.test(text)) return "clinic-dental";
  if (/clinic|doctor|arzt|medecin|physio|osteo|health|praxis/.test(text)) return "clinic-care";
  if (/fashion|mode|clothing|boutique/.test(text)) return "retail-fashion";
  if (/jewel|watch|artisan|maker|atelier/.test(text)) return "retail-artisan";
  if (/agency|consult|coach|studio|service/.test(text)) return "service-professional";
  return (
    normalize(vertical)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "local-business"
  );
}

function defaultGoal(subvertical: string): string {
  if (subvertical.startsWith("restaurant") || subvertical.startsWith("cafe"))
    return "info_brochure";
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

function styleContractFor(input: {
  era: StyleEra;
  subvertical: string;
  goal: string;
  archetype: DesignArchetype;
  vibe: Vibe;
  seed: string;
}): StyleContract {
  const catalogFirst =
    input.subvertical.startsWith("restaurant") ||
    input.subvertical.startsWith("cafe") ||
    input.subvertical.startsWith("retail");
  if (input.era === "classic") {
    return {
      era: "classic",
      navStyle: "classic",
      heroVariants:
        input.goal === "lead_capture" || input.goal === "appointment_booking"
          ? ["split-image-right", "centered", "split-form-right"]
          : ["centered", "split-image-right", "image-bg-overlay"],
      sectionOrder: catalogFirst
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
          ],
      variantPools: {
        hero: ["centered", "split-image-right"],
        about: ["text-image-split", "values-3col"],
        menu_preview: ["list-borders", "split-image"],
        offer: ["split-image-price", "banner-centered"],
        gallery: ["grid-2x2", "masonry-3"],
        testimonials: ["large-quote", "cards-3col"],
        faq: ["accordion", "two-column"],
        contact: ["split-map", "cards-row"],
        lead_form: ["card-centered", "split-side-image"],
      },
      palettePool: [
        "alpine-clean",
        "geneve-elegance",
        "bern-heritage",
        "graphite-pro",
        "champagne-soft",
        "forest-calm",
      ],
      fontPairPool: ["playfair-inter", "fraunces-inter", "playfair-lora", "ibm-plex-source-serif"],
      rhythmStyle: "quiet-trust",
      spacing: "compact",
      motionStyle: "quiet",
    };
  }

  if (input.era === "modern") {
    return {
      era: "modern",
      navStyle:
        input.archetype === "kinetic-launch" ||
        input.vibe.minimalBold > 0.35 ||
        input.vibe.calmEnergetic > 0.35
          ? "bold-pill"
          : "editorial",
      heroVariants:
        input.archetype === "editorial-showcase" || input.archetype === "boutique-story"
          ? ["editorial-bold", "image-bg-overlay", "gradient-spotlight"]
          : input.goal === "lead_capture" || input.goal === "appointment_booking"
            ? ["editorial-bold", "gradient-spotlight", "split-form-right"]
            : ["editorial-bold", "gradient-spotlight", "image-bg-overlay"],
      sectionOrder: catalogFirst
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
          ],
      variantPools: {
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
      },
      palettePool: [
        "violet-noir",
        "monochrome-bold",
        "midnight-emerald",
        "electric-lime",
        "fuchsia-bold",
        "neon-pulse",
      ],
      fontPairPool: ["space-grotesk-inter", "archivo-inter", "bebas-inter", "manrope-inter"],
      rhythmStyle: "kinetic-contrast",
      spacing: "editorial",
      motionStyle: input.vibe.calmEnergetic > 0.25 ? "kinetic" : "carousel-forward",
    };
  }

  return {
    era: "balanced",
    navStyle: "compact-cta",
    heroVariants:
      input.goal === "lead_capture" || input.goal === "appointment_booking"
        ? ["split-form-right", "image-bg-overlay", "split-image-right"]
        : ["image-bg-overlay", "split-image-right", "centered"],
    sectionOrder: catalogFirst
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
        ],
    variantPools: {
      hero: ["split-form-right", "image-bg-overlay", "split-image-right"],
      about: ["values-3col", "text-image-split", "team-grid"],
      menu_preview: ["cards-grid", "list-borders", "split-image"],
      offer: ["banner-centered", "split-image-price", "countdown-bold"],
      gallery: ["feature-side", "masonry-3", "carousel-strip"],
      testimonials: ["cards-3col", "list-with-avatars", "large-quote"],
      faq: ["two-column", "accordion", "numbered-list"],
      contact: ["cards-row", "split-map"],
      lead_form: ["split-side-image", "card-centered", "full-width-bar"],
    },
    palettePool: [
      "zurich-modern",
      "ocean-fresh",
      "warm-roasted",
      "sage-wellness",
      "rose-blush",
      "graphite-pro",
    ],
    fontPairPool: ["manrope-inter", "inter-inter", "dm-serif-dm-sans", "fraunces-inter"],
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
  const imageDirection: ImageDirection =
    input.imageStrategy === "ai"
      ? "ai-hero"
      : subvertical.startsWith("retail")
        ? "product-detail"
        : archetype === "editorial-showcase" || archetype === "boutique-story"
          ? "editorial-people"
          : archetype === "calm-service"
            ? "ambient-space"
            : "curated-local";

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
