import {
  getFontPair,
  getPalette,
  getTheme,
  googleFontsUrlForPair,
} from "@marketing/landing-design-system";
import type { CSSProperties } from "react";

type BrandThemeFallback = {
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
};

type ResolveLandingThemeInput = {
  themeKey?: string | null;
  stepData?: Record<string, unknown> | null;
  brandFallback?: BrandThemeFallback | null;
};

export type ResolvedLandingTheme = {
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  fontHeading: string;
  fontBody: string;
  googleFontsHref: string | null;
  cssVars: CSSProperties;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

function mixHex(from: string, to: string, amountTo: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  if (!a || !b) return from;
  const t = clamp01(amountTo);
  return `#${toHex(a.r + (b.r - a.r) * t)}${toHex(a.g + (b.g - a.g) * t)}${toHex(a.b + (b.b - a.b) * t)}`;
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(17, 24, 39, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.2;
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function readableOn(hex: string): string {
  return luminance(hex) > 0.52 ? "#111827" : "#ffffff";
}

function fontStack(font?: string | null, fallback = "system-ui, sans-serif"): string {
  return font?.trim() ? font : fallback;
}

export function resolveLandingTheme(input: ResolveLandingThemeInput): ResolvedLandingTheme {
  const theme = input.themeKey ? getTheme(input.themeKey) : undefined;
  const palette = theme
    ? getPalette(theme.paletteKey)
    : input.themeKey
      ? getPalette(input.themeKey)
      : undefined;

  const stepFontPairKey =
    typeof input.stepData?.["themeFontPair"] === "string"
      ? (input.stepData["themeFontPair"] as string)
      : null;
  const stepFontPair = stepFontPairKey ? getFontPair(stepFontPairKey) : undefined;
  const themeFontPair = theme ? getFontPair(theme.fontPairKey) : undefined;
  const fontPair = stepFontPair ?? themeFontPair;

  const primary = palette?.colors.primary ?? input.brandFallback?.colorPrimary ?? "#111827";
  const secondary = palette?.colors.secondary ?? input.brandFallback?.colorSecondary ?? "#6b7280";
  const accent = palette?.colors.accent ?? secondary;
  const text = palette?.colors.text ?? "#111827";
  const rawSurface = palette?.colors.surface ?? "#f9fafb";
  const surface = luminance(rawSurface) < 0.18 ? mixHex(rawSurface, "#ffffff", 0.9) : rawSurface;
  const canvas = mixHex(surface, "#ffffff", 0.22);
  const darkBg = luminance(rawSurface) < 0.18 ? rawSurface : mixHex(primary, "#020617", 0.68);
  const card =
    luminance(surface) < 0.25 ? mixHex(surface, "#ffffff", 0.16) : mixHex(surface, "#ffffff", 0.66);

  const fontHeading = fontPair
    ? `'${fontPair.heading.family}', ${fontPair.heading.fallback}`
    : fontStack(input.brandFallback?.fontHeading);
  const fontBody = fontPair
    ? `'${fontPair.body.family}', ${fontPair.body.fallback}`
    : fontStack(input.brandFallback?.fontBody);

  const cssVars: CSSProperties = {
    ["--brand-primary" as string]: primary,
    ["--brand-secondary" as string]: secondary,
    ["--brand-accent" as string]: accent,
    ["--brand-surface" as string]: surface,
    ["--brand-text" as string]: text,
    ["--font-heading" as string]: fontHeading,
    ["--font-body" as string]: fontBody,
    ["--lp-canvas" as string]: canvas,
    ["--lp-surface" as string]: surface,
    ["--lp-subtle" as string]: mixHex(surface, "#ffffff", 0.48),
    ["--lp-card" as string]: card,
    ["--lp-text" as string]: text,
    ["--lp-text-soft" as string]: mixHex(text, "#ffffff", 0.22),
    ["--lp-muted" as string]: secondary,
    ["--lp-border" as string]: rgba(text, 0.12),
    ["--lp-dark-bg" as string]: darkBg,
    ["--lp-dark-card" as string]: rgba("#ffffff", 0.06),
    ["--lp-dark-border" as string]: rgba("#ffffff", 0.1),
    ["--lp-dark-text" as string]: "#ffffff",
    ["--lp-dark-muted" as string]: "rgba(255, 255, 255, 0.74)",
    ["--lp-on-primary" as string]: readableOn(primary),
    ["--lp-on-dark" as string]: "#ffffff",
    ["--lp-nav-bg" as string]: rgba(card, 0.92),
    ["--lp-nav-border" as string]: rgba(text, 0.1),
    ["--lp-shadow-soft" as string]: `0 18px 46px ${rgba(text, 0.1)}`,
    ["--lp-shadow-card" as string]: `0 8px 28px ${rgba(text, 0.08)}`,
  };

  return {
    brandPrimary: primary,
    brandSecondary: secondary,
    brandAccent: accent,
    fontHeading,
    fontBody,
    googleFontsHref: fontPair ? googleFontsUrlForPair(fontPair) : null,
    cssVars,
  };
}

export const LANDING_THEME_GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: var(--lp-canvas, #ffffff); color: var(--lp-text, #111827); }
  .lp-themed-page {
    min-height: 100vh;
    background: var(--lp-canvas, #ffffff);
    color: var(--lp-text, #111827);
    font-family: var(--font-body, system-ui, sans-serif);
  }
  .lp-themed-page input,
  .lp-themed-page textarea,
  .lp-themed-page select {
    font-family: var(--font-body, system-ui, sans-serif);
    color: var(--lp-text, #111827);
    background: var(--lp-card, #ffffff);
    border-color: var(--lp-border, #d1d5db);
  }
  .lp-themed-page ::selection {
    background: var(--brand-accent, #a5b4fc);
    color: var(--lp-text, #111827);
  }
`;
