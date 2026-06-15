// Curated palette catalog — 24 palettes, designer-tuned for contrast (WCAG AA on body text) and emotional fit.
// 5 are Swiss-coded (alpine-clean, zurich-modern, geneve-elegance, ticino-sun, bern-heritage).
// 19 are global. Each palette has exactly 5 colors: primary, secondary, accent, surface, text.

export type Palette = {
  key: string;
  name: string;
  /** Where this palette feels at home — informs theme matching. */
  vibe: "warm" | "cool" | "neutral" | "vibrant" | "earthy" | "luxe";
  swissCoded: boolean;
  colors: {
    /** Main brand color — buttons, links, accents. */
    primary: string;
    /** Supporting brand color — borders, secondary CTAs. */
    secondary: string;
    /** Pop color for highlights — sparingly used. */
    accent: string;
    /** Section background variation (alongside white). */
    surface: string;
    /** Body text base color. */
    text: string;
  };
  /** Hex code for the gallery card chip + theme-picker swatch. */
  swatch: string;
};

export const PALETTES: readonly Palette[] = [
  // ─── SWISS-CODED PALETTES (5) ───────────────────────────────────────────────
  {
    key: "alpine-clean",
    name: "Alpine Clean",
    vibe: "neutral",
    swissCoded: true,
    colors: {
      primary: "#1a1a1a",
      secondary: "#525252",
      accent: "#dc2626",
      surface: "#f5f5f5",
      text: "#171717",
    },
    swatch: "#1a1a1a",
  },
  {
    key: "zurich-modern",
    name: "Zürich Modern",
    vibe: "cool",
    swissCoded: true,
    colors: {
      primary: "#1e3a5f",
      secondary: "#64748b",
      accent: "#0ea5e9",
      surface: "#f1f5f9",
      text: "#0f172a",
    },
    swatch: "#1e3a5f",
  },
  {
    key: "geneve-elegance",
    name: "Genève Élégance",
    vibe: "luxe",
    swissCoded: true,
    colors: {
      primary: "#7c2d12",
      secondary: "#a78f6d",
      accent: "#d4a574",
      surface: "#faf6f0",
      text: "#3f2e1d",
    },
    swatch: "#7c2d12",
  },
  {
    key: "ticino-sun",
    name: "Ticino Sun",
    vibe: "warm",
    swissCoded: true,
    colors: {
      primary: "#c2410c",
      secondary: "#84714b",
      accent: "#fbbf24",
      surface: "#fef7ed",
      text: "#431407",
    },
    swatch: "#c2410c",
  },
  {
    key: "bern-heritage",
    name: "Bern Heritage",
    vibe: "warm",
    swissCoded: true,
    colors: {
      primary: "#991b1b",
      secondary: "#78716c",
      accent: "#d6d3d1",
      surface: "#fafaf9",
      text: "#1c1917",
    },
    swatch: "#991b1b",
  },

  // ─── WARM / COZY (cafes, restaurants, retail) ───────────────────────────────
  {
    key: "warm-roasted",
    name: "Warm Roasted",
    vibe: "warm",
    swissCoded: false,
    colors: {
      primary: "#6b3410",
      secondary: "#a16207",
      accent: "#fbbf24",
      surface: "#fef3c7",
      text: "#451a03",
    },
    swatch: "#6b3410",
  },
  {
    key: "morning-cream",
    name: "Morning Cream",
    vibe: "warm",
    swissCoded: false,
    colors: {
      primary: "#9a3412",
      secondary: "#c2410c",
      accent: "#fed7aa",
      surface: "#fffbeb",
      text: "#431407",
    },
    swatch: "#9a3412",
  },
  {
    key: "burgundy-velvet",
    name: "Burgundy Velvet",
    vibe: "luxe",
    swissCoded: false,
    colors: {
      primary: "#4c1d24",
      secondary: "#7f1d1d",
      accent: "#fbbf24",
      surface: "#fef2f2",
      text: "#1c1917",
    },
    swatch: "#4c1d24",
  },
  {
    key: "terracotta-clay",
    name: "Terracotta Clay",
    vibe: "earthy",
    swissCoded: false,
    colors: {
      primary: "#b45309",
      secondary: "#a16207",
      accent: "#84cc16",
      surface: "#fef3c7",
      text: "#451a03",
    },
    swatch: "#b45309",
  },

  // ─── COOL / FRESH (fitness, clinic, service) ────────────────────────────────
  {
    key: "ocean-fresh",
    name: "Ocean Fresh",
    vibe: "cool",
    swissCoded: false,
    colors: {
      primary: "#0c4a6e",
      secondary: "#0e7490",
      accent: "#06b6d4",
      surface: "#ecfeff",
      text: "#0c4a6e",
    },
    swatch: "#0c4a6e",
  },
  {
    key: "mint-clinic",
    name: "Mint Clinic",
    vibe: "cool",
    swissCoded: false,
    colors: {
      primary: "#047857",
      secondary: "#10b981",
      accent: "#a7f3d0",
      surface: "#ecfdf5",
      text: "#064e3b",
    },
    swatch: "#047857",
  },
  {
    key: "midnight-luxe",
    name: "Midnight Luxe",
    vibe: "luxe",
    swissCoded: false,
    colors: {
      primary: "#0f172a",
      secondary: "#334155",
      accent: "#fbbf24",
      surface: "#f8fafc",
      text: "#0f172a",
    },
    swatch: "#0f172a",
  },
  {
    key: "indigo-trust",
    name: "Indigo Trust",
    vibe: "cool",
    swissCoded: false,
    colors: {
      primary: "#3730a3",
      secondary: "#6366f1",
      accent: "#a5b4fc",
      surface: "#eef2ff",
      text: "#1e1b4b",
    },
    swatch: "#3730a3",
  },
  {
    key: "sky-startup",
    name: "Sky Startup",
    vibe: "cool",
    swissCoded: false,
    colors: {
      primary: "#0369a1",
      secondary: "#0284c7",
      accent: "#7dd3fc",
      surface: "#f0f9ff",
      text: "#082f49",
    },
    swatch: "#0369a1",
  },

  // ─── VIBRANT / ENERGETIC (fitness, retail, events) ──────────────────────────
  {
    key: "sport-orange",
    name: "Sport Orange",
    vibe: "vibrant",
    swissCoded: false,
    colors: {
      primary: "#ea580c",
      secondary: "#7c2d12",
      accent: "#fed7aa",
      surface: "#fff7ed",
      text: "#7c2d12",
    },
    swatch: "#ea580c",
  },
  {
    key: "neon-pulse",
    name: "Neon Pulse",
    vibe: "vibrant",
    swissCoded: false,
    colors: {
      primary: "#0f0c29",
      secondary: "#7c3aed",
      accent: "#a855f7",
      surface: "#faf5ff",
      text: "#1e1b4b",
    },
    swatch: "#7c3aed",
  },
  {
    key: "fuchsia-bold",
    name: "Fuchsia Bold",
    vibe: "vibrant",
    swissCoded: false,
    colors: {
      primary: "#a21caf",
      secondary: "#c026d3",
      accent: "#f0abfc",
      surface: "#fdf4ff",
      text: "#581c87",
    },
    swatch: "#a21caf",
  },
  {
    key: "rose-blush",
    name: "Rose Blush",
    vibe: "vibrant",
    swissCoded: false,
    colors: {
      primary: "#be123c",
      secondary: "#e11d48",
      accent: "#fda4af",
      surface: "#fff1f2",
      text: "#4c0519",
    },
    swatch: "#e11d48",
  },
  {
    key: "electric-lime",
    name: "Electric Lime",
    vibe: "vibrant",
    swissCoded: false,
    colors: {
      primary: "#1a2e05",
      secondary: "#365314",
      accent: "#a3e635",
      surface: "#f7fee7",
      text: "#1a2e05",
    },
    swatch: "#84cc16",
  },

  // ─── EARTHY / NATURAL (clinic, retail, B2B service) ─────────────────────────
  {
    key: "forest-calm",
    name: "Forest Calm",
    vibe: "earthy",
    swissCoded: false,
    colors: {
      primary: "#14532d",
      secondary: "#15803d",
      accent: "#bbf7d0",
      surface: "#f7fee7",
      text: "#052e16",
    },
    swatch: "#14532d",
  },
  {
    key: "sage-wellness",
    name: "Sage Wellness",
    vibe: "earthy",
    swissCoded: false,
    colors: {
      primary: "#3f6212",
      secondary: "#65a30d",
      accent: "#d9f99d",
      surface: "#f7fee7",
      text: "#1a2e05",
    },
    swatch: "#65a30d",
  },
  {
    key: "stone-minimal",
    name: "Stone Minimal",
    vibe: "neutral",
    swissCoded: false,
    colors: {
      primary: "#44403c",
      secondary: "#78716c",
      accent: "#a8a29e",
      surface: "#fafaf9",
      text: "#1c1917",
    },
    swatch: "#44403c",
  },

  // ─── NEUTRAL / CLASSIC (universal) ──────────────────────────────────────────
  {
    key: "graphite-pro",
    name: "Graphite Pro",
    vibe: "neutral",
    swissCoded: false,
    colors: {
      primary: "#1f2937",
      secondary: "#4b5563",
      accent: "#3b82f6",
      surface: "#f9fafb",
      text: "#111827",
    },
    swatch: "#1f2937",
  },
  {
    key: "champagne-soft",
    name: "Champagne Soft",
    vibe: "luxe",
    swissCoded: false,
    colors: {
      primary: "#a16207",
      secondary: "#d4a574",
      accent: "#fef3c7",
      surface: "#fffbeb",
      text: "#451a03",
    },
    swatch: "#d4a574",
  },
  {
    key: "lavender-grace",
    name: "Lavender Grace",
    vibe: "luxe",
    swissCoded: false,
    colors: {
      primary: "#6d28d9",
      secondary: "#8b5cf6",
      accent: "#c4b5fd",
      surface: "#f5f3ff",
      text: "#2e1065",
    },
    swatch: "#7c3aed",
  },
  {
    key: "monochrome-bold",
    name: "Monochrome Bold",
    vibe: "neutral",
    swissCoded: false,
    colors: {
      primary: "#000000",
      secondary: "#404040",
      accent: "#fbbf24",
      surface: "#fafafa",
      text: "#000000",
    },
    swatch: "#000000",
  },

  // ─── DARK / MODERN (contemporary, work with dark hero variants) ─────────────
  {
    key: "violet-noir",
    name: "Violet Noir",
    vibe: "luxe",
    swissCoded: false,
    colors: {
      primary: "#7c3aed",
      secondary: "#4c1d95",
      accent: "#a78bfa",
      surface: "#0f0a1e",
      text: "#1e1b4b",
    },
    swatch: "#7c3aed",
  },
  {
    key: "midnight-emerald",
    name: "Midnight Emerald",
    vibe: "luxe",
    swissCoded: false,
    colors: {
      primary: "#059669",
      secondary: "#064e3b",
      accent: "#6ee7b7",
      surface: "#06120e",
      text: "#022c22",
    },
    swatch: "#059669",
  },
];

export const PALETTES_BY_KEY: ReadonlyMap<string, Palette> = new Map(
  PALETTES.map((p) => [p.key, p]),
);

export function getPalette(key: string): Palette | undefined {
  return PALETTES_BY_KEY.get(key);
}

export type PaletteKey = (typeof PALETTES)[number]["key"];
