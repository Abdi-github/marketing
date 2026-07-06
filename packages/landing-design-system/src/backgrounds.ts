export const BACKGROUND_STYLES = {
  clean: {
    key: "clean",
    name: "Clean",
    description: "Flat canvas for fast, quiet SME pages.",
  },
  paper: {
    key: "paper",
    name: "Paper",
    description: "Warm editorial surface with subtle paper-like depth.",
  },
  grid: {
    key: "grid",
    name: "Grid",
    description: "Technical grid for agencies, SaaS, and professional services.",
  },
  "subtle-noise": {
    key: "subtle-noise",
    name: "Subtle Noise",
    description: "Fine layered texture for soft premium themes.",
  },
  spotlight: {
    key: "spotlight",
    name: "Spotlight",
    description: "Soft radial light for premium modern pages.",
  },
  "image-led": {
    key: "image-led",
    name: "Image Led",
    description: "Quiet base that lets photography and hero media dominate.",
  },
} as const;

export type BackgroundStyleKey = keyof typeof BACKGROUND_STYLES;

export function isBackgroundStyleKey(value: string): value is BackgroundStyleKey {
  return value in BACKGROUND_STYLES;
}
