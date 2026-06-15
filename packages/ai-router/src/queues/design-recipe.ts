// Design-recipe engine (ADR-0029).
//
// Turns the user's vibe + goals + a per-page seed into a *cohesive* set of design choices:
// a variant per section type, plus a suggested palette / font pair when the page has none.
//
// Why deterministic (not LLM-picked): cannot hallucinate invalid variant keys, fully
// reproducible/testable, and visually cohesive. The seed gives variety so two pages with the
// same vibe still look different. This is what stops every generated page looking identical.

import { SECTION_VARIANTS, DEFAULT_VARIANT, type SectionType } from "./section-variants";
import type { LandingPageDesignPlan } from "./design-plan";
import type { LandingPageComposition, LandingPageSection } from "./landing-page.schema";

export type Vibe = {
  minimalBold: number; // -1 minimal … +1 bold
  classicModern: number; // -1 classic … +1 modern
  calmEnergetic: number; // -1 calm … +1 energetic
};

export type DesignRecipe = {
  variants: Partial<Record<SectionType, string>>;
  paletteKey: string;
  fontPairKey: string;
};

export type DesignRecipePlanSignals = Pick<
  LandingPageDesignPlan,
  | "archetype"
  | "heroTreatment"
  | "sectionTopology"
  | "imageDirection"
  | "motionStyle"
  | "density"
  | "styleContract"
>;

// Style affinity per "type:variant" as [boldness, modernity, energy] in roughly -1..1.
// Unlisted variants score neutral (0,0,0). Tune freely — this is the design knowledge.
const STYLE: Record<string, [number, number, number]> = {
  // hero
  "hero:centered": [0.6, 0.0, 0.4],
  "hero:split-image-right": [-0.3, 0.6, -0.2],
  "hero:image-bg-overlay": [0.7, 0.5, 0.3],
  "hero:split-form-right": [0.0, 0.2, 0.5],
  "hero:editorial-bold": [0.9, 0.8, 0.4],
  "hero:gradient-spotlight": [0.4, 0.9, 0.6],
  // about
  "about:text-image-split": [-0.2, 0.0, -0.2],
  "about:team-grid": [0.0, 0.4, 0.0],
  "about:values-3col": [-0.3, 0.3, 0.0],
  // menu_preview
  "menu_preview:list-borders": [-0.3, 0.0, -0.1],
  "menu_preview:cards-grid": [0.1, 0.4, 0.1],
  "menu_preview:split-image": [-0.1, 0.2, 0.0],
  // offer
  "offer:banner-centered": [0.5, 0.0, 0.3],
  "offer:split-image-price": [-0.1, 0.3, 0.0],
  "offer:countdown-bold": [0.8, 0.2, 0.7],
  // gallery
  "gallery:masonry-3": [0.0, 0.5, 0.0],
  "gallery:grid-2x2": [-0.4, 0.1, -0.1],
  "gallery:carousel-strip": [0.1, 0.4, 0.5],
  "gallery:feature-side": [0.1, 0.3, 0.0],
  // testimonials
  "testimonials:cards-3col": [0.0, 0.0, 0.0],
  "testimonials:large-quote": [0.2, 0.4, -0.2],
  "testimonials:list-with-avatars": [-0.1, 0.3, 0.0],
  "testimonials:marquee": [0.3, 0.8, 0.5],
  // faq
  "faq:accordion": [-0.3, 0.0, -0.1],
  "faq:two-column": [0.0, 0.3, 0.0],
  "faq:numbered-list": [0.4, 0.1, 0.1],
  // contact
  "contact:split-map": [0.0, 0.0, 0.0],
  "contact:cards-row": [0.0, 0.4, 0.1],
  "contact:full-map-overlay": [0.5, 0.4, 0.2],
  // lead_form
  "lead_form:card-centered": [0.0, 0.0, 0.0],
  "lead_form:split-side-image": [-0.1, 0.4, 0.0],
  "lead_form:full-width-bar": [0.5, 0.1, 0.3],
  // whatsapp_cta
  "whatsapp_cta:centered-button": [0.0, 0.0, 0.0],
  "whatsapp_cta:banner-strip": [0.3, 0.1, 0.2],
};

// Goal → small per-variant nudges (favour conversion-shaped layouts for action goals).
const GOAL_BOOST: Record<string, Record<string, number>> = {
  lead_capture: {
    "hero:split-form-right": 0.5,
    "lead_form:split-side-image": 0.4,
    "lead_form:full-width-bar": 0.3,
  },
  appointment_booking: {
    "hero:split-form-right": 0.5,
    "lead_form:card-centered": 0.3,
    "contact:cards-row": 0.3,
  },
  sales_promo: {
    "offer:countdown-bold": 0.6,
    "offer:banner-centered": 0.3,
    "hero:image-bg-overlay": 0.3,
  },
  event_signup: {
    "hero:split-form-right": 0.4,
    "offer:countdown-bold": 0.3,
    "lead_form:full-width-bar": 0.3,
  },
  info_brochure: {
    "hero:editorial-bold": 0.3,
    "about:text-image-split": 0.3,
    "gallery:feature-side": 0.2,
  },
};

const ARCHETYPE_BOOST: Record<string, Record<string, number>> = {
  "conversion-split": {
    "hero:split-form-right": 0.35,
    "hero:split-image-right": 0.2,
    "lead_form:split-side-image": 0.3,
    "contact:cards-row": 0.15,
  },
  "editorial-showcase": {
    "hero:editorial-bold": 0.45,
    "about:text-image-split": 0.2,
    "gallery:feature-side": 0.25,
    "testimonials:large-quote": 0.2,
  },
  "boutique-story": {
    "hero:split-image-right": 0.3,
    "about:values-3col": 0.2,
    "gallery:masonry-3": 0.25,
    "testimonials:large-quote": 0.2,
  },
  "menu-magazine": {
    "hero:image-bg-overlay": 0.25,
    "menu_preview:split-image": 0.35,
    "gallery:feature-side": 0.25,
    "testimonials:large-quote": 0.15,
  },
  "trust-first": {
    "hero:split-form-right": 0.2,
    "about:team-grid": 0.25,
    "testimonials:list-with-avatars": 0.3,
    "faq:accordion": 0.2,
  },
  "kinetic-launch": {
    "hero:gradient-spotlight": 0.45,
    "offer:countdown-bold": 0.35,
    "gallery:carousel-strip": 0.25,
    "testimonials:marquee": 0.2,
  },
  "calm-service": {
    "hero:split-image-right": 0.25,
    "about:text-image-split": 0.25,
    "faq:two-column": 0.2,
    "contact:split-map": 0.15,
  },
  "premium-local": {
    "hero:image-bg-overlay": 0.25,
    "about:values-3col": 0.2,
    "gallery:masonry-3": 0.15,
    "testimonials:cards-3col": 0.2,
  },
};

const PLAN_SIGNAL_BOOST: Record<string, Record<string, number>> = {
  "hero-treatment:image-overlay": { "hero:image-bg-overlay": 0.35 },
  "hero-treatment:split-media": { "hero:split-image-right": 0.35 },
  "hero-treatment:centered-statement": { "hero:centered": 0.35 },
  "hero-treatment:form-first": { "hero:split-form-right": 0.45, "lead_form:card-centered": 0.2 },
  "hero-treatment:editorial-headline": { "hero:editorial-bold": 0.45 },
  "hero-treatment:gradient-spotlight": { "hero:gradient-spotlight": 0.45 },
  "topology:catalog-first": {
    "menu_preview:cards-grid": 0.25,
    "menu_preview:split-image": 0.25,
    "gallery:masonry-3": 0.15,
  },
  "topology:conversion-first": {
    "hero:split-form-right": 0.25,
    "lead_form:full-width-bar": 0.2,
    "offer:banner-centered": 0.15,
  },
  "topology:proof-first": {
    "testimonials:list-with-avatars": 0.2,
    "testimonials:large-quote": 0.2,
    "faq:numbered-list": 0.15,
  },
  "image-direction:product-detail": { "gallery:grid-2x2": 0.2, "menu_preview:cards-grid": 0.2 },
  "motion:carousel-forward": { "gallery:carousel-strip": 0.25, "testimonials:marquee": 0.2 },
  "motion:kinetic": { "hero:gradient-spotlight": 0.2, "offer:countdown-bold": 0.2 },
  "density:airy": { "hero:split-image-right": 0.1, "gallery:feature-side": 0.1 },
  "density:dense": { "offer:countdown-bold": 0.15, "lead_form:full-width-bar": 0.15 },
};

/** Deterministic string → [0,1) (FNV-1a). */
function hashUnit(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

function planBoost(
  type: SectionType,
  variant: string,
  designPlan?: DesignRecipePlanSignals | null,
): number {
  if (!designPlan) return 0;
  const key = `${type}:${variant}`;
  const signalKeys = [
    designPlan.archetype,
    `hero-treatment:${designPlan.heroTreatment}`,
    `topology:${designPlan.sectionTopology}`,
    `image-direction:${designPlan.imageDirection}`,
    `motion:${designPlan.motionStyle}`,
    `density:${designPlan.density}`,
  ];
  let boost = 0;
  boost += ARCHETYPE_BOOST[designPlan.archetype]?.[key] ?? 0;
  for (const signalKey of signalKeys) {
    boost += PLAN_SIGNAL_BOOST[signalKey]?.[key] ?? 0;
  }
  return boost;
}

function scoreVariant(
  type: SectionType,
  variant: string,
  vibe: Vibe,
  goals: string[],
  seed: string,
  designPlan?: DesignRecipePlanSignals | null,
): number {
  const [b, m, e] = STYLE[`${type}:${variant}`] ?? [0, 0, 0];
  const fit = vibe.minimalBold * b + vibe.classicModern * m + vibe.calmEnergetic * e;
  let goal = 0;
  for (const g of goals) goal += GOAL_BOOST[g]?.[`${type}:${variant}`] ?? 0;
  // Seeded jitter (±0.3) → variety across pages with similar vibes.
  const jitter = (hashUnit(`${seed}|${type}|${variant}`) - 0.5) * 0.6;
  const contractPool = designPlan?.styleContract.variantPools[type];
  const contract = contractPool?.includes(variant) ? 0.75 : contractPool ? -0.35 : 0;
  return fit + goal + planBoost(type, variant, designPlan) + contract + jitter;
}

/** Pick the best-fitting variant for a section type given vibe/goals/seed. */
export function pickVariant(
  type: SectionType,
  vibe: Vibe,
  goals: string[],
  seed: string,
  designPlan?: DesignRecipePlanSignals | null,
): string {
  const variants = SECTION_VARIANTS[type] as readonly string[];
  let best = DEFAULT_VARIANT[type];
  let bestScore = -Infinity;
  for (const v of variants) {
    const s = scoreVariant(type, v, vibe, goals, seed, designPlan);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

// Palette / font pools keyed by leaning. Keys must exist in @marketing/landing-design-system.
const PALETTE_POOLS = {
  bold: ["midnight-luxe", "violet-noir", "monochrome-bold", "sport-orange", "midnight-emerald"],
  modern: ["violet-noir", "zurich-modern", "midnight-emerald", "ocean-fresh", "graphite-pro"],
  minimal: ["alpine-clean", "zurich-modern", "stone-minimal", "forest-calm"],
  elegant: [
    "geneve-elegance",
    "lavender-grace",
    "midnight-luxe",
    "violet-noir",
    "bern-heritage",
    "champagne-soft",
  ],
  energetic: ["sport-orange", "rose-blush", "fuchsia-bold", "neon-pulse", "ticino-sun"],
  calm: ["forest-calm", "lavender-grace", "ocean-fresh", "sage-wellness", "alpine-clean"],
  neutral: [
    "warm-roasted",
    "ocean-fresh",
    "zurich-modern",
    "graphite-pro",
    "forest-calm",
    "geneve-elegance",
  ],
} as const;

const FONT_POOLS = {
  modern: ["space-grotesk-inter", "manrope-inter", "archivo-inter"],
  bold: ["archivo-inter", "bebas-inter", "space-grotesk-inter"],
  elegant: ["playfair-inter", "playfair-lora", "fraunces-inter", "dm-serif-dm-sans"],
  minimal: ["inter-inter", "manrope-inter"],
  neutral: ["inter-inter", "manrope-inter", "dm-serif-dm-sans", "fraunces-inter"],
} as const;

function pickFromPool(pool: readonly string[], seed: string): string {
  return pool[Math.floor(hashUnit(seed) * pool.length) % pool.length]!;
}

function leaning(vibe: Vibe): keyof typeof PALETTE_POOLS {
  if (vibe.minimalBold > 0.33) return vibe.calmEnergetic > 0.33 ? "energetic" : "bold";
  if (vibe.minimalBold < -0.33) return "minimal";
  if (vibe.classicModern > 0.33) return "modern";
  if (vibe.classicModern < -0.33) return "elegant";
  if (vibe.calmEnergetic < -0.33) return "calm";
  return "neutral";
}

/**
 * Assign a visual rhythm tone to each section so the page alternates between
 * light and dark backgrounds. Only a subset of section types support dark mode
 * (those that have been styled for it). Returns a parallel array of tones.
 *
 * Rules:
 * - hero: always undefined — each hero variant controls its own background.
 * - testimonials (not marquee): always "dark" — the highest-impact section, present on
 *   most pages, guaranteeing at least one dark break per generated page.
 * - about:values-3col: "dark" — feature grids look great as SaaS-style dark sections.
 * - offer:banner-centered: "accent" — brand-color block; the primary CTA pop.
 * - lead_form:full-width-bar: "accent" — brand-color bar; draws eyes to the conversion action.
 * - everything else: undefined (retains its inherent light background).
 */
export function computeSectionRhythm(
  sections: { type: string; variant?: string | null }[],
): Array<"dark" | "accent" | undefined> {
  return sections.map((s) => {
    if (s.type === "hero") return undefined;
    if (s.type === "testimonials" && s.variant !== "marquee") return "dark";
    if (s.type === "about" && s.variant === "values-3col") return "dark";
    if (s.type === "offer" && s.variant === "banner-centered") return "accent";
    if (s.type === "lead_form" && s.variant === "full-width-bar") return "accent";
    if (s.type === "faq" && (s.variant == null || s.variant === "accordion")) return "dark";
    return undefined;
  });
}

function computeContractRhythm(
  sections: { type: string; variant?: string | null }[],
  era: DesignRecipePlanSignals["styleContract"]["era"],
): Array<"dark" | "accent" | undefined> {
  if (era === "classic") {
    return sections.map((s) => {
      if (s.type === "hero") return undefined;
      if (s.type === "testimonials" && s.variant === "large-quote") return "dark";
      if (s.type === "offer" && s.variant === "banner-centered") return "accent";
      return undefined;
    });
  }
  if (era === "modern") {
    return sections.map((s) => {
      if (s.type === "hero") return undefined;
      if (s.type === "offer") return "accent";
      if (s.type === "lead_form") return "accent";
      if (s.type === "about" && s.variant === "values-3col") return "dark";
      if (s.type === "faq") return "dark";
      if (s.type === "testimonials" && s.variant !== "marquee") return "dark";
      return undefined;
    });
  }
  return computeSectionRhythm(sections);
}

function pickContractVariant(type: SectionType, pool: readonly string[], seed: string): string {
  const valid = pool.filter((variant) =>
    (SECTION_VARIANTS[type] as readonly string[]).includes(variant),
  );
  if (valid.length === 0) return DEFAULT_VARIANT[type];
  return pickFromPool(valid, seed);
}

function withCarouselMotion(section: LandingPageSection, era: string): LandingPageSection {
  if (era !== "modern") return section;
  if (section.type === "gallery" && section.variant === "carousel-strip") {
    return {
      ...section,
      extras: {
        ...(section.extras ?? {}),
        carousel: {
          enabled: true,
          mode: "auto",
          delayMs: 3600,
          effect: "slide",
          ...((section.extras as { carousel?: object } | undefined)?.carousel ?? {}),
        },
      },
    } as LandingPageSection;
  }
  if (section.type === "hero" && section.variant === "image-bg-overlay") {
    return {
      ...section,
      extras: {
        ...(section.extras ?? {}),
        carousel: {
          enabled: true,
          mode: "auto",
          delayMs: 4200,
          effect: "fade",
          ...((section.extras as { carousel?: object } | undefined)?.carousel ?? {}),
        },
      },
    } as LandingPageSection;
  }
  return section;
}

export function applyStyleContractToComposition(input: {
  composition: LandingPageComposition;
  designPlan?: DesignRecipePlanSignals | null;
  seed: string;
}): LandingPageComposition {
  const contract = input.designPlan?.styleContract;
  if (!contract) return input.composition;

  const orderRank = new Map(contract.sectionOrder.map((type, index) => [type, index]));
  const sorted = input.composition.sections
    .map((section, originalIndex) => ({ section, originalIndex }))
    .sort((a, b) => {
      const ar = orderRank.get(a.section.type) ?? 99;
      const br = orderRank.get(b.section.type) ?? 99;
      return ar === br ? a.originalIndex - b.originalIndex : ar - br;
    })
    .map(({ section }, index) => {
      const type = section.type as SectionType;
      const pool =
        type === "hero" && contract.heroVariants.length > 0
          ? contract.heroVariants
          : contract.variantPools[type];
      const variant = pool
        ? pickContractVariant(type, pool, `${input.seed}|${contract.era}|${type}`)
        : (section.variant ?? DEFAULT_VARIANT[type]);
      return withCarouselMotion(
        { ...section, order: index, variant } as LandingPageSection,
        contract.era,
      );
    });

  const tones = computeContractRhythm(
    sorted.map((section) => ({ type: section.type, variant: section.variant })),
    contract.era,
  );

  return {
    ...input.composition,
    sections: sorted.map((section, index) =>
      tones[index] ? { ...section, tone: tones[index] } : { ...section, tone: undefined },
    ),
    site: input.composition.site
      ? {
          ...input.composition.site,
          nav: input.composition.site.nav
            ? { ...input.composition.site.nav, style: contract.navStyle }
            : input.composition.site.nav,
        }
      : input.composition.site,
  };
}

/** Build a full cohesive design recipe for a page. */
export function pickDesignRecipe(input: {
  vibe?: Partial<Vibe> | null;
  goals?: string[] | null;
  seed: string;
  sectionTypes?: string[];
  designPlan?: DesignRecipePlanSignals | null;
}): DesignRecipe {
  const vibe: Vibe = {
    minimalBold: input.vibe?.minimalBold ?? 0,
    classicModern: input.vibe?.classicModern ?? 0,
    calmEnergetic: input.vibe?.calmEnergetic ?? 0,
  };
  const goals = input.goals ?? [];
  const types = (input.sectionTypes ?? Object.keys(SECTION_VARIANTS)).filter(
    (t): t is SectionType => t in SECTION_VARIANTS,
  );

  const variants: Partial<Record<SectionType, string>> = {};
  for (const t of types) variants[t] = pickVariant(t, vibe, goals, input.seed, input.designPlan);

  const lean = leaning(vibe);
  const palettePool =
    input.designPlan?.styleContract.palettePool ?? PALETTE_POOLS[lean] ?? PALETTE_POOLS.neutral;
  const fontLean: keyof typeof FONT_POOLS =
    lean === "bold" || lean === "energetic"
      ? "bold"
      : lean === "elegant"
        ? "elegant"
        : lean === "minimal" || lean === "calm"
          ? "minimal"
          : lean === "modern"
            ? "modern"
            : "neutral";

  return {
    variants,
    paletteKey: pickFromPool(palettePool, `${input.seed}|palette`),
    fontPairKey: pickFromPool(
      input.designPlan?.styleContract.fontPairPool ?? FONT_POOLS[fontLean],
      `${input.seed}|font`,
    ),
  };
}
