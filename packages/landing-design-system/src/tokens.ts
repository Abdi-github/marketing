// Design tokens — the foundation under every theme.
// Curated scales (not arbitrary). Spacing/radius follow a 4px base; shadows/breakpoints picked for SME-class landing pages.

export type SpacingScale = {
  /** 4px  — hairline gaps. */
  px1: string;
  /** 8px  — chip padding. */
  px2: string;
  /** 12px — inline element padding. */
  px3: string;
  /** 16px — base unit. */
  px4: string;
  /** 24px — card padding. */
  px6: string;
  /** 32px — section gap inside cards. */
  px8: string;
  /** 48px — section padding (mobile). */
  px12: string;
  /** 64px — section padding (tablet). */
  px16: string;
  /** 96px — section padding (desktop) — generous white space rule. */
  px24: string;
  /** 128px — hero vertical breathing. */
  px32: string;
};

export const SPACING: SpacingScale = {
  px1: "0.25rem",
  px2: "0.5rem",
  px3: "0.75rem",
  px4: "1rem",
  px6: "1.5rem",
  px8: "2rem",
  px12: "3rem",
  px16: "4rem",
  px24: "6rem",
  px32: "8rem",
};

export type RadiusScale = {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
};

/** Per-theme radius density. A theme picks one of these as its "default" radius. */
export const RADIUS_DENSITIES = {
  sharp: { none: "0", sm: "0", md: "2px", lg: "4px", xl: "6px", full: "9999px" },
  modest: { none: "0", sm: "4px", md: "8px", lg: "12px", xl: "16px", full: "9999px" },
  rounded: { none: "0", sm: "6px", md: "12px", lg: "20px", xl: "28px", full: "9999px" },
  pill: { none: "0", sm: "8px", md: "16px", lg: "24px", xl: "36px", full: "9999px" },
} as const satisfies Record<string, RadiusScale>;

export type RadiusDensity = keyof typeof RADIUS_DENSITIES;

/** Box-shadow scale. Subtle for minimal/elegant themes, bolder for playful/bold. */
export const SHADOWS = {
  none: "none",
  xs: "0 1px 2px rgba(0,0,0,0.04)",
  sm: "0 1px 6px rgba(0,0,0,0.06)",
  md: "0 4px 16px rgba(0,0,0,0.08)",
  lg: "0 8px 32px rgba(0,0,0,0.12)",
  xl: "0 16px 48px rgba(0,0,0,0.18)",
  glow: "0 0 32px rgba(0,0,0,0.25)",
} as const;

export type ShadowKey = keyof typeof SHADOWS;

/** Responsive breakpoints (matches Tailwind defaults + device-preview targets). */
export const BREAKPOINTS = {
  /** Phone (iPhone X reference). */
  phone: 375,
  /** Tablet (iPad reference). */
  tablet: 768,
  /** Desktop (laptop reference). */
  desktop: 1280,
  /** Wide (large monitor). */
  wide: 1920,
} as const;

/** Container max-widths per section archetype (drives content width, not page width). */
export const CONTAINERS = {
  narrow: 600, // Lead form, contact form
  reading: 720, // FAQ, about-text
  default: 960, // About-with-team, menu_preview
  wide: 1100, // Testimonials grid, contact-cards
  gallery: 1200, // Image galleries
  hero: 1440, // Hero (closer to full-width with side padding)
} as const;

/** Type-pair size ratios. A theme picks one — drives clamp() values in section components. */
export const TYPE_RATIOS = {
  /** 1.125x — compact, info-dense (clinic, B2B). */
  compact: { ratio: 1.125, baseRem: 1 },
  /** 1.25x — friendly default. */
  cozy: { ratio: 1.25, baseRem: 1 },
  /** 1.333x — confident editorial (cafe, restaurant). */
  airy: { ratio: 1.333, baseRem: 1 },
  /** 1.5x — bold, statement-making (fitness, retail). */
  dramatic: { ratio: 1.5, baseRem: 1.05 },
} as const;

export type TypeRatio = keyof typeof TYPE_RATIOS;
