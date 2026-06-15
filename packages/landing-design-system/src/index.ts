// Design system foundation for the landing page builder.
// Consumed by: section variant components (LP-3), template seeds (LP-2), wizard UI (LP-4), editor (LP-5).

export { SPACING, RADIUS_DENSITIES, SHADOWS, BREAKPOINTS, CONTAINERS, TYPE_RATIOS } from "./tokens";
export type { SpacingScale, RadiusScale, RadiusDensity, ShadowKey, TypeRatio } from "./tokens";

export { PALETTES, PALETTES_BY_KEY, getPalette } from "./palettes";
export type { Palette, PaletteKey } from "./palettes";

export {
  FONT_PAIRS,
  FONT_PAIRS_BY_KEY,
  FONT_FAMILIES,
  getFontPair,
  googleFontsUrl,
  googleFontsUrlForPair,
} from "./fonts";
export type { FontFamily, FontPair, FontPairKey } from "./fonts";

export { THEMES, THEMES_BY_KEY, SWISS_THEMES, getTheme, themesForVertical } from "./themes";
export type { Theme, ThemeKey, ThemeVibe } from "./themes";

export {
  IMAGE_BUNDLES,
  IMAGE_BUNDLES_BY_KEY,
  getImageBundle,
  imageBundlesForVertical,
  pickBundleForVertical,
  buildUnsplashUrl,
  unsplashCredit,
} from "./unsplash-bundles";
export type {
  UnsplashPhoto,
  ImageBundle,
  ImageBundleKey,
  UnsplashUrlOpts,
} from "./unsplash-bundles";

export {
  isSwissLocale,
  formatPriceCHF,
  formatPhoneCH,
  formatDateCH,
  formatDateTimeCH,
  formatAddressCH,
  parsePriceCHF,
} from "./i18n-format";
export type { SwissLocale, SwissAddress } from "./i18n-format";

export { defineTemplate, getSectionStructure } from "./template-content";
export type {
  TemplateDefinition,
  TemplateSection,
  TemplateVertical,
  TemplateStyle,
  TemplateGoal,
  SectionsByLocale,
  SectionExtrasMap,
  SectionType as TemplateSectionType,
} from "./template-content";
