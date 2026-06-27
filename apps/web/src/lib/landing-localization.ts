import { landingPageCompositionSchema, type LandingPageComposition } from "@marketing/ai-router";

export type LocalizedLandingCompositions = Record<string, LandingPageComposition>;

function isComposition(value: unknown): value is LandingPageComposition {
  return landingPageCompositionSchema.safeParse(value).success;
}

export function selectLocalizedComposition(input: {
  composition: LandingPageComposition;
  stepData: Record<string, unknown> | null | undefined;
  activeLocale: string;
  defaultLocale: string;
}): LandingPageComposition {
  void input.defaultLocale;
  const localized = input.stepData?.["localizedCompositions"] as
    | LocalizedLandingCompositions
    | undefined;
  const candidate = localized?.[input.activeLocale];
  return isComposition(candidate) ? candidate : input.composition;
}
