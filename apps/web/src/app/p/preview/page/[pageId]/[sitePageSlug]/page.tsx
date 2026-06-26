// Draft preview subpage route for generated website shells.
// URL: /p/preview/page/<pageId>/<sitePageSlug>

import { db } from "@marketing/db";
import { landingPages, landingPageVersions } from "@marketing/db";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { FormSettings, FormStep, LandingPageComposition } from "@marketing/ai-router";
import LeadForm from "../../../../../../components/lead-form";
import { SectionBlock } from "../../../../../../components/landing/section-renderer";
import {
  LandingSiteFooter,
  LandingSiteNav,
  getSitePageSections,
} from "../../../../../../components/landing/site-shell";
import { PreviewSyncBridge } from "../../../../../../components/landing/editor/preview-sync-bridge";
import { Reveal } from "../../../../../../components/landing/reveal";
import { anchorIdsForSection } from "../../../../../../components/landing/cta-targets";
import {
  isLandingPageLocale,
  normalizeLandingLanguagePreferences,
} from "../../../../../../lib/landing-language";
import { selectLocalizedComposition } from "../../../../../../lib/landing-localization";
import {
  compositionHasLeadCapture,
  ensureLandingPageLeadForm,
  getLandingPageLeadForm,
} from "../../../../../../lib/landing-page-forms";
import { LANDING_THEME_GLOBAL_CSS, resolveLandingTheme } from "../../../../../../lib/landing-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ pageId: string; sitePageSlug: string }>;
  searchParams?: Promise<{ lang?: string }>;
};

export default async function DraftPreviewSitePage({ params, searchParams }: Props) {
  const { pageId, sitePageSlug } = await params;
  const query = await searchParams;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId)) {
    notFound();
  }

  const [page] = await db
    .select({
      id: landingPages.id,
      tenantId: landingPages.tenantId,
      title: landingPages.title,
      currentVersionId: landingPages.currentVersionId,
      themeKey: landingPages.themeKey,
      locale: landingPages.locale,
      stepData: landingPages.stepData,
    })
    .from(landingPages)
    .where(eq(landingPages.id, pageId));

  if (!page?.currentVersionId) notFound();

  const [version] = await db
    .select({ composition: landingPageVersions.composition })
    .from(landingPageVersions)
    .where(
      and(
        eq(landingPageVersions.tenantId, page.tenantId),
        eq(landingPageVersions.id, page.currentVersionId),
      ),
    );

  if (!version) notFound();

  const composition = version.composition as LandingPageComposition;
  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  const languagePreferences = normalizeLandingLanguagePreferences(
    stepData["languagePreferences"],
    page.locale,
  );
  const activeLocale = isLandingPageLocale(query?.lang)
    ? query.lang
    : languagePreferences.defaultLocale;
  const renderComposition = selectLocalizedComposition({
    composition,
    stepData,
    activeLocale,
    defaultLocale: languagePreferences.defaultLocale,
  });
  const sections = getSitePageSections(renderComposition, sitePageSlug);
  if (!sections) notFound();

  const theme = resolveLandingTheme({
    themeKey: page.themeKey,
    stepData,
  });
  const basePath = `/p/preview/page/${pageId}`;

  const vertical =
    ((stepData?.["wizardPayload"] as { vertical?: unknown } | undefined)?.vertical as
      | string
      | undefined) ?? undefined;
  const goal =
    ((stepData?.["wizardPayload"] as { goal?: unknown } | undefined)?.goal as string | undefined) ??
    undefined;
  let form = compositionHasLeadCapture(renderComposition)
    ? await getLandingPageLeadForm(page.tenantId, page.id)
    : null;
  if (!form && compositionHasLeadCapture(renderComposition)) {
    form = await ensureLandingPageLeadForm({
      tenantId: page.tenantId,
      landingPageId: page.id,
      pageTitle: page.title,
      pageSlug: basePath.split("/").at(-1) ?? page.id,
      locale: activeLocale,
      vertical,
      goal,
      composition: renderComposition,
    });
  }

  return (
    <>
      <style href="landing-theme" precedence="default">
        {LANDING_THEME_GLOBAL_CSS}
      </style>
      {theme.googleFontsHref && <link rel="stylesheet" href={theme.googleFontsHref} />}
      <div className="lp-themed-page" style={theme.cssVars}>
        <p
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            background: "#fef3c7",
            color: "#92400e",
            textAlign: "center",
            padding: "0.4rem 1rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            zIndex: 9999,
            borderBottom: "1px solid #fcd34d",
          }}
        >
          Draft preview - not visible to the public
        </p>
        <div style={{ paddingTop: "1.85rem" }}>
          <LandingSiteNav
            site={renderComposition.site}
            basePath={basePath}
            activePageSlug={sitePageSlug}
            brandPrimary={theme.brandPrimary}
            topOffset="1.85rem"
            languagePreferences={languagePreferences}
            activeLocale={activeLocale}
          />
          {sections.map((section, i) => (
            <div
              key={i}
              id={`lp-section-${i}`}
              data-lp-section={i}
              style={{ scrollMarginTop: "1.85rem" }}
            >
              {anchorIdsForSection(section.type).map((anchorId) => (
                <div key={anchorId} id={anchorId} style={{ scrollMarginTop: "110px" }} />
              ))}
              <Reveal>
                <SectionBlock
                  section={section}
                  brandPrimary={theme.brandPrimary}
                  leadFormFor={() => {
                    if (form) {
                      return (
                        <LeadForm
                          tenantSlug=""
                          formSlug={form.slug}
                          schema={form.schema as Record<string, unknown>}
                          steps={form.steps as FormStep[] | undefined}
                          settings={form.settings as Partial<FormSettings> | undefined}
                          submitLabel={form.submitLabel ?? undefined}
                        />
                      );
                    }
                    return (
                      <div
                        style={{
                          padding: "2rem",
                          textAlign: "center",
                          color: "#9ca3af",
                          fontStyle: "italic",
                          border: "1px dashed #e5e7eb",
                          borderRadius: 12,
                        }}
                      >
                        [Lead form will render here]
                      </div>
                    );
                  }}
                />
              </Reveal>
            </div>
          ))}
          <LandingSiteFooter site={renderComposition.site} basePath={basePath} />
        </div>
        <PreviewSyncBridge />
      </div>
    </>
  );
}
