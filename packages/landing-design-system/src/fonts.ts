// Curated Google Font pairings — 12 combos designer-tested for hierarchy and harmony.
// Each pair has a heading + body family. Pairings reference the Google Fonts CSS API.
// Loading strategy: Next.js `next/font/google` per pair (LP-3 will wire this in tailwind.config + layout).

export type FontFamily = {
  /** Google Fonts family name (e.g. "Inter", "Playfair Display"). */
  family: string;
  /** Weight axis values to load. */
  weights: readonly number[];
  /** CSS fallback stack appended after the loaded family. */
  fallback: string;
  /** Whether the family is a display/heading face (vs. body workhorse). */
  display: boolean;
};

export type FontPair = {
  key: string;
  name: string;
  /** Vibe + ideal vertical fit (informs theme matching). */
  vibe: "minimal" | "bold" | "elegant" | "playful" | "editorial" | "swiss";
  heading: FontFamily;
  body: FontFamily;
};

// ─── Font building blocks (re-used across pairs) ──────────────────────────────

const INTER: FontFamily = {
  family: "Inter",
  weights: [400, 500, 600, 700, 800],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const MANROPE: FontFamily = {
  family: "Manrope",
  weights: [400, 500, 600, 700, 800],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const PLAYFAIR: FontFamily = {
  family: "Playfair Display",
  weights: [400, 600, 700, 800, 900],
  fallback: "Georgia, Cambria, 'Times New Roman', serif",
  display: true,
};

const LORA: FontFamily = {
  family: "Lora",
  weights: [400, 500, 600, 700],
  fallback: "Georgia, Cambria, 'Times New Roman', serif",
  display: false,
};

const FRAUNCES: FontFamily = {
  family: "Fraunces",
  weights: [400, 500, 600, 700, 800, 900],
  fallback: "Georgia, Cambria, 'Times New Roman', serif",
  display: true,
};

const SPACE_GROTESK: FontFamily = {
  family: "Space Grotesk",
  weights: [400, 500, 600, 700],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: true,
};

const POPPINS: FontFamily = {
  family: "Poppins",
  weights: [400, 500, 600, 700, 800],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const DM_SANS: FontFamily = {
  family: "DM Sans",
  weights: [400, 500, 600, 700],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const DM_SERIF_DISPLAY: FontFamily = {
  family: "DM Serif Display",
  weights: [400],
  fallback: "Georgia, Cambria, 'Times New Roman', serif",
  display: true,
};

const SOURCE_SERIF: FontFamily = {
  family: "Source Serif 4",
  weights: [400, 500, 600, 700],
  fallback: "Georgia, Cambria, 'Times New Roman', serif",
  display: false,
};

const ARCHIVO: FontFamily = {
  family: "Archivo",
  weights: [400, 500, 600, 700, 800, 900],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const MONTSERRAT: FontFamily = {
  family: "Montserrat",
  weights: [400, 500, 600, 700, 800],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const QUICKSAND: FontFamily = {
  family: "Quicksand",
  weights: [400, 500, 600, 700],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

const BEBAS_NEUE: FontFamily = {
  family: "Bebas Neue",
  weights: [400],
  fallback: "Impact, 'Arial Narrow Bold', sans-serif",
  display: true,
};

const IBM_PLEX_SANS: FontFamily = {
  family: "IBM Plex Sans",
  weights: [400, 500, 600, 700],
  fallback: "system-ui, -apple-system, Segoe UI, sans-serif",
  display: false,
};

// ─── 12 curated pairings ──────────────────────────────────────────────────────

export const FONT_PAIRS: readonly FontPair[] = [
  {
    key: "inter-inter",
    name: "Inter Pure",
    vibe: "minimal",
    heading: INTER,
    body: INTER,
  },
  {
    key: "manrope-inter",
    name: "Manrope + Inter",
    vibe: "minimal",
    heading: MANROPE,
    body: INTER,
  },
  {
    key: "playfair-inter",
    name: "Playfair + Inter",
    vibe: "elegant",
    heading: PLAYFAIR,
    body: INTER,
  },
  {
    key: "playfair-lora",
    name: "Playfair + Lora",
    vibe: "editorial",
    heading: PLAYFAIR,
    body: LORA,
  },
  {
    key: "fraunces-inter",
    name: "Fraunces + Inter",
    vibe: "editorial",
    heading: FRAUNCES,
    body: INTER,
  },
  {
    key: "space-grotesk-inter",
    name: "Space Grotesk + Inter",
    vibe: "bold",
    heading: SPACE_GROTESK,
    body: INTER,
  },
  {
    key: "archivo-inter",
    name: "Archivo + Inter",
    vibe: "bold",
    heading: ARCHIVO,
    body: INTER,
  },
  {
    key: "dm-serif-dm-sans",
    name: "DM Serif + DM Sans",
    vibe: "elegant",
    heading: DM_SERIF_DISPLAY,
    body: DM_SANS,
  },
  {
    key: "bebas-inter",
    name: "Bebas Neue + Inter",
    vibe: "bold",
    heading: BEBAS_NEUE,
    body: INTER,
  },
  {
    key: "poppins-poppins",
    name: "Poppins Friendly",
    vibe: "playful",
    heading: POPPINS,
    body: POPPINS,
  },
  {
    key: "quicksand-dm-sans",
    name: "Quicksand + DM Sans",
    vibe: "playful",
    heading: QUICKSAND,
    body: DM_SANS,
  },
  {
    key: "ibm-plex-source-serif",
    name: "IBM Plex + Source Serif",
    vibe: "swiss",
    heading: IBM_PLEX_SANS,
    body: SOURCE_SERIF,
  },
];

export const FONT_PAIRS_BY_KEY: ReadonlyMap<string, FontPair> = new Map(
  FONT_PAIRS.map((p) => [p.key, p]),
);

export function getFontPair(key: string): FontPair | undefined {
  return FONT_PAIRS_BY_KEY.get(key);
}

/** Build a Google Fonts URL for a single FontFamily. */
export function googleFontsUrl(font: FontFamily): string {
  const family = font.family.replace(/ /g, "+");
  const weights = font.weights.join(";");
  // Use the @1,wght@... syntax for upright italic-aware loading.
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap`;
}

/** Build the combined Google Fonts URL for a pair (one network request). */
export function googleFontsUrlForPair(pair: FontPair): string {
  const families = [pair.heading, pair.body];
  // Deduplicate when heading and body share the family.
  const dedup = pair.heading.family === pair.body.family ? [pair.heading] : families;
  const params = dedup
    .map((f) => `family=${f.family.replace(/ /g, "+")}:wght@${f.weights.join(";")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

export type FontPairKey = (typeof FONT_PAIRS)[number]["key"];

// Re-exported pre-named families for theme curation convenience.
export const FONT_FAMILIES = {
  INTER,
  MANROPE,
  PLAYFAIR,
  LORA,
  FRAUNCES,
  SPACE_GROTESK,
  POPPINS,
  DM_SANS,
  DM_SERIF_DISPLAY,
  SOURCE_SERIF,
  ARCHIVO,
  MONTSERRAT,
  QUICKSAND,
  BEBAS_NEUE,
  IBM_PLEX_SANS,
} as const;
