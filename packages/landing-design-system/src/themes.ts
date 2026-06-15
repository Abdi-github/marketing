// Theme bundles — the load-bearing layer of the design system.
// A theme = palette + font pair + radius density + type ratio + shadow scale + vibe.
// 24 curated themes at launch; the wizard's "palette" step is really "theme" picker.

import type { PaletteKey } from "./palettes";
import type { FontPairKey } from "./fonts";
import type { RadiusDensity, TypeRatio, ShadowKey } from "./tokens";

export type ThemeVibe =
  | "minimal"
  | "bold"
  | "elegant"
  | "playful"
  | "editorial"
  | "swiss"
  | "luxe"
  | "energetic";

export type Theme = {
  key: string;
  /** Display name (translated via next-intl in UI). */
  name: string;
  /** Short description (translated via next-intl in UI). */
  description: string;
  paletteKey: PaletteKey;
  fontPairKey: FontPairKey;
  radius: RadiusDensity;
  typeRatio: TypeRatio;
  /** Default section shadow key. */
  shadow: ShadowKey;
  vibe: ThemeVibe;
  swissCoded: boolean;
  /** Verticals this theme is best matched to (informs gallery filter + wizard scoring). */
  bestFor: readonly string[];
};

export const THEMES: readonly Theme[] = [
  // ─── SWISS-CODED THEMES (5) ─────────────────────────────────────────────────
  {
    key: "alpine-clean",
    name: "Alpine Clean",
    description: "Swiss International Style: tight grid, restrained palette, IBM Plex precision.",
    paletteKey: "alpine-clean",
    fontPairKey: "ibm-plex-source-serif",
    radius: "sharp",
    typeRatio: "compact",
    shadow: "xs",
    vibe: "swiss",
    swissCoded: true,
    bestFor: ["service", "clinic", "retail"],
  },
  {
    key: "zurich-modern",
    name: "Zürich Modern",
    description: "Cool, professional, finance-friendly. For consulting and B2B SMEs.",
    paletteKey: "zurich-modern",
    fontPairKey: "manrope-inter",
    radius: "modest",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "swiss",
    swissCoded: true,
    bestFor: ["service", "clinic"],
  },
  {
    key: "geneve-elegance",
    name: "Genève Élégance",
    description: "Warm cream + maroon, French-Swiss sophistication. Editorial vibe.",
    paletteKey: "geneve-elegance",
    fontPairKey: "fraunces-inter",
    radius: "modest",
    typeRatio: "airy",
    shadow: "md",
    vibe: "elegant",
    swissCoded: true,
    bestFor: ["restaurant", "retail"],
  },
  {
    key: "ticino-sun",
    name: "Ticino Sun",
    description:
      "Terracotta + olive, Mediterranean Italian-Swiss warmth. For trattorias, gelaterias.",
    paletteKey: "ticino-sun",
    fontPairKey: "playfair-lora",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "elegant",
    swissCoded: true,
    bestFor: ["restaurant", "cafe"],
  },
  {
    key: "bern-heritage",
    name: "Bern Heritage",
    description: "Deep red + ivory, evokes Swiss flag without literalism. Heritage-coded.",
    paletteKey: "bern-heritage",
    fontPairKey: "playfair-inter",
    radius: "sharp",
    typeRatio: "compact",
    shadow: "sm",
    vibe: "swiss",
    swissCoded: true,
    bestFor: ["service", "retail", "clinic"],
  },

  // ─── WARM / HOSPITALITY (cafe, restaurant) ──────────────────────────────────
  {
    key: "warm-roasted",
    name: "Warm Roasted",
    description: "Espresso browns + amber. Cafés that take their coffee seriously.",
    paletteKey: "warm-roasted",
    fontPairKey: "fraunces-inter",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "editorial",
    swissCoded: false,
    bestFor: ["cafe", "restaurant"],
  },
  {
    key: "morning-cream",
    name: "Morning Cream",
    description: "Sunlit oranges + creamy backgrounds. Brunch energy.",
    paletteKey: "morning-cream",
    fontPairKey: "dm-serif-dm-sans",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "playful",
    swissCoded: false,
    bestFor: ["cafe", "restaurant"],
  },
  {
    key: "burgundy-velvet",
    name: "Burgundy Velvet",
    description: "Deep wine + gold. Fine dining and intimate restaurants.",
    paletteKey: "burgundy-velvet",
    fontPairKey: "playfair-lora",
    radius: "modest",
    typeRatio: "airy",
    shadow: "lg",
    vibe: "luxe",
    swissCoded: false,
    bestFor: ["restaurant"],
  },
  {
    key: "terracotta-clay",
    name: "Terracotta Clay",
    description: "Earthy clay + lime green. Artisan bakeries, organic cafés.",
    paletteKey: "terracotta-clay",
    fontPairKey: "fraunces-inter",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "editorial",
    swissCoded: false,
    bestFor: ["cafe", "restaurant", "retail"],
  },

  // ─── COOL / WELLNESS (fitness, clinic) ──────────────────────────────────────
  {
    key: "ocean-fresh",
    name: "Ocean Fresh",
    description: "Deep navy + cyan accents. Confident and calm.",
    paletteKey: "ocean-fresh",
    fontPairKey: "manrope-inter",
    radius: "modest",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "minimal",
    swissCoded: false,
    bestFor: ["clinic", "fitness", "service"],
  },
  {
    key: "mint-clinic",
    name: "Mint Clinic",
    description: "Soft mint + emerald. Wellness, dental, holistic care.",
    paletteKey: "mint-clinic",
    fontPairKey: "manrope-inter",
    radius: "rounded",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "minimal",
    swissCoded: false,
    bestFor: ["clinic"],
  },
  {
    key: "midnight-luxe",
    name: "Midnight Luxe",
    description: "Near-black + gold accents. Premium brands, high-end services.",
    paletteKey: "midnight-luxe",
    fontPairKey: "playfair-inter",
    radius: "sharp",
    typeRatio: "airy",
    shadow: "lg",
    vibe: "luxe",
    swissCoded: false,
    bestFor: ["service", "retail", "restaurant"],
  },
  {
    key: "indigo-trust",
    name: "Indigo Trust",
    description: "Deep indigo + lavender. Professional services with a friendly edge.",
    paletteKey: "indigo-trust",
    fontPairKey: "manrope-inter",
    radius: "modest",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "minimal",
    swissCoded: false,
    bestFor: ["service", "clinic"],
  },
  {
    key: "sky-startup",
    name: "Sky Startup",
    description: "Open sky blue. SaaS and consulting.",
    paletteKey: "sky-startup",
    fontPairKey: "space-grotesk-inter",
    radius: "modest",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "bold",
    swissCoded: false,
    bestFor: ["service"],
  },

  // ─── VIBRANT / ENERGETIC (fitness, retail) ──────────────────────────────────
  {
    key: "sport-orange",
    name: "Sport Orange",
    description: "Burnt orange + cream. High-energy fitness studios.",
    paletteKey: "sport-orange",
    fontPairKey: "archivo-inter",
    radius: "modest",
    typeRatio: "dramatic",
    shadow: "md",
    vibe: "energetic",
    swissCoded: false,
    bestFor: ["fitness", "retail"],
  },
  {
    key: "neon-pulse",
    name: "Neon Pulse",
    description: "Electric violet + black. Urban gyms, late-night bars.",
    paletteKey: "neon-pulse",
    fontPairKey: "bebas-inter",
    radius: "sharp",
    typeRatio: "dramatic",
    shadow: "glow",
    vibe: "bold",
    swissCoded: false,
    bestFor: ["fitness", "restaurant"],
  },
  {
    key: "fuchsia-bold",
    name: "Fuchsia Bold",
    description: "Magenta + soft pink. Salons, fashion retail, beauty.",
    paletteKey: "fuchsia-bold",
    fontPairKey: "space-grotesk-inter",
    radius: "rounded",
    typeRatio: "dramatic",
    shadow: "md",
    vibe: "playful",
    swissCoded: false,
    bestFor: ["retail", "service"],
  },
  {
    key: "rose-blush",
    name: "Rose Blush",
    description: "Rose, blush, and clean serif contrast. Beauty, boutiques, and modern studios.",
    paletteKey: "rose-blush",
    fontPairKey: "dm-serif-dm-sans",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "playful",
    swissCoded: false,
    bestFor: ["retail", "service", "cafe"],
  },
  {
    key: "electric-lime",
    name: "Electric Lime",
    description: "Black + lime green. Outdoor, adventure, edgy brands.",
    paletteKey: "electric-lime",
    fontPairKey: "archivo-inter",
    radius: "sharp",
    typeRatio: "dramatic",
    shadow: "lg",
    vibe: "bold",
    swissCoded: false,
    bestFor: ["fitness", "retail"],
  },

  // ─── EARTHY / NATURAL ───────────────────────────────────────────────────────
  {
    key: "forest-calm",
    name: "Forest Calm",
    description: "Deep forest green. Yoga studios, herbal cafés.",
    paletteKey: "forest-calm",
    fontPairKey: "fraunces-inter",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "sm",
    vibe: "elegant",
    swissCoded: false,
    bestFor: ["clinic", "cafe", "service"],
  },
  {
    key: "sage-wellness",
    name: "Sage Wellness",
    description: "Sage green + cream. Organic markets, juice bars.",
    paletteKey: "sage-wellness",
    fontPairKey: "dm-serif-dm-sans",
    radius: "rounded",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "minimal",
    swissCoded: false,
    bestFor: ["cafe", "retail", "clinic"],
  },
  {
    key: "stone-minimal",
    name: "Stone Minimal",
    description: "Warm grey + sand. Architectural studios, design retail.",
    paletteKey: "stone-minimal",
    fontPairKey: "inter-inter",
    radius: "sharp",
    typeRatio: "compact",
    shadow: "xs",
    vibe: "minimal",
    swissCoded: false,
    bestFor: ["service", "retail"],
  },

  // ─── NEUTRAL / UNIVERSAL ────────────────────────────────────────────────────
  {
    key: "graphite-pro",
    name: "Graphite Pro",
    description: "Classic grey + blue. The safe, professional all-rounder.",
    paletteKey: "graphite-pro",
    fontPairKey: "inter-inter",
    radius: "modest",
    typeRatio: "cozy",
    shadow: "sm",
    vibe: "minimal",
    swissCoded: false,
    bestFor: ["service", "clinic", "retail"],
  },
  {
    key: "champagne-soft",
    name: "Champagne Soft",
    description: "Warm gold + cream. Bridal, beauty, special events.",
    paletteKey: "champagne-soft",
    fontPairKey: "playfair-lora",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "luxe",
    swissCoded: false,
    bestFor: ["service", "retail"],
  },
  {
    key: "lavender-grace",
    name: "Lavender Grace",
    description:
      "Soft violet with editorial calm. Wellness, premium services, and polished retail.",
    paletteKey: "lavender-grace",
    fontPairKey: "playfair-inter",
    radius: "rounded",
    typeRatio: "airy",
    shadow: "md",
    vibe: "elegant",
    swissCoded: false,
    bestFor: ["service", "clinic", "retail"],
  },
  {
    key: "monochrome-bold",
    name: "Monochrome Bold",
    description: "Pure black & white + yellow accent. Maximum contrast statement.",
    paletteKey: "monochrome-bold",
    fontPairKey: "archivo-inter",
    radius: "sharp",
    typeRatio: "dramatic",
    shadow: "md",
    vibe: "bold",
    swissCoded: false,
    bestFor: ["retail", "service", "fitness"],
  },
  {
    key: "violet-noir",
    name: "Violet Noir",
    description: "Violet on near-black for nightlife, creators, and premium modern brands.",
    paletteKey: "violet-noir",
    fontPairKey: "space-grotesk-inter",
    radius: "sharp",
    typeRatio: "dramatic",
    shadow: "glow",
    vibe: "bold",
    swissCoded: false,
    bestFor: ["fitness", "restaurant", "service"],
  },
  {
    key: "midnight-emerald",
    name: "Midnight Emerald",
    description: "Emerald over deep midnight. Spa, boutique hospitality, and upscale services.",
    paletteKey: "midnight-emerald",
    fontPairKey: "manrope-inter",
    radius: "modest",
    typeRatio: "cozy",
    shadow: "lg",
    vibe: "luxe",
    swissCoded: false,
    bestFor: ["clinic", "service", "restaurant"],
  },
];

export const THEMES_BY_KEY: ReadonlyMap<string, Theme> = new Map(THEMES.map((t) => [t.key, t]));

export function getTheme(key: string): Theme | undefined {
  return THEMES_BY_KEY.get(key);
}

/** Recommend themes for a given vertical (preserves array order = "best to OK fit"). */
export function themesForVertical(vertical: string): readonly Theme[] {
  return THEMES.filter((t) => t.bestFor.includes(vertical));
}

/** All Swiss-coded themes (powers the 🇨🇭 filter chip in the gallery). */
export const SWISS_THEMES: readonly Theme[] = THEMES.filter((t) => t.swissCoded);

export type ThemeKey = (typeof THEMES)[number]["key"];
