import { db } from "@marketing/db";
import { forms } from "@marketing/db";
import { and, desc, eq } from "drizzle-orm";
import type { FormSettings, FormStep, LandingPageComposition } from "@marketing/ai-router";
import {
  buildAutoLandingFormDefinition,
  compositionHasLeadCapture,
} from "./landing-page-form-definition";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type LandingPageLeadFormRecord = {
  id: string;
  slug: string;
  schema: Record<string, unknown>;
  steps: FormStep[] | null;
  settings: Partial<FormSettings> | null;
  submitLabel: string | null;
  name: string;
  isActive: boolean;
};

const LANDING_PAGE_FORM_SELECT = {
  id: forms.id,
  slug: forms.slug,
  schema: forms.schema,
  steps: forms.steps,
  settings: forms.settings,
  submitLabel: forms.submitLabel,
  name: forms.name,
  isActive: forms.isActive,
} as const;

export async function getLandingPageLeadForm(
  tenantId: string,
  landingPageId: string,
): Promise<LandingPageLeadFormRecord | null> {
  const [form] = await db
    .select(LANDING_PAGE_FORM_SELECT)
    .from(forms)
    .where(and(eq(forms.tenantId, tenantId), eq(forms.landingPageId, landingPageId)))
    .orderBy(desc(forms.isActive), desc(forms.createdAt))
    .limit(1);

  return (form as LandingPageLeadFormRecord | undefined) ?? null;
}

export async function ensureLandingPageLeadForm(input: {
  tenantId: string;
  landingPageId: string;
  pageTitle: string;
  pageSlug: string;
  locale?: string | null;
  vertical?: string | null;
  goal?: string | null;
  composition?: LandingPageComposition | null;
}): Promise<LandingPageLeadFormRecord | null> {
  if (input.composition && !compositionHasLeadCapture(input.composition)) {
    return null;
  }

  const existing = await getLandingPageLeadForm(input.tenantId, input.landingPageId);
  if (existing) {
    if (!existing.isActive) {
      await db
        .update(forms)
        .set({ isActive: true, updatedAt: new Date() })
        .where(and(eq(forms.tenantId, input.tenantId), eq(forms.id, existing.id)));
      return { ...existing, isActive: true };
    }
    return existing;
  }

  const autoForm = buildAutoLandingFormDefinition({
    locale: input.locale,
    vertical: input.vertical,
    goal: input.goal,
    composition: input.composition,
  });
  const slugStem = slugify(input.pageSlug || input.pageTitle || "landing-page");
  const slug = `${slugStem || "landing-page"}-lead-${input.landingPageId.slice(0, 8)}`;

  const [created] = await db
    .insert(forms)
    .values({
      tenantId: input.tenantId,
      name: `${input.pageTitle} - ${autoForm.name}`.slice(0, 120),
      slug,
      schema: autoForm.schema,
      steps: autoForm.steps,
      settings: autoForm.settings,
      submitLabel: autoForm.submitLabel,
      landingPageId: input.landingPageId,
      isActive: true,
    })
    .returning(LANDING_PAGE_FORM_SELECT);

  return (created as LandingPageLeadFormRecord | undefined) ?? null;
}

export { compositionHasLeadCapture } from "./landing-page-form-definition";
