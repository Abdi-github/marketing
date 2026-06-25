// Generated website subpage render.
// URL: /p/<tenantSlug>/<pageSlug>/<sitePageSlug>

import { db } from "@marketing/db";
import {
  landingPages,
  landingPageVersions,
  landingPageViews,
  landingPageExperiments,
  experimentVariants,
  tenants,
  brandAssets,
} from "@marketing/db";
import { and, desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { FormSettings, FormStep, LandingPageComposition } from "@marketing/ai-router";
import LeadForm from "../../../../../components/lead-form";
import { SectionBlock } from "../../../../../components/landing/section-renderer";
import {
  LandingSiteFooter,
  LandingSiteNav,
  getSitePage,
  getSitePageSections,
} from "../../../../../components/landing/site-shell";
import { Reveal } from "../../../../../components/landing/reveal";
import { ConsentBanner } from "../consent-banner";
import {
  isLandingPageLocale,
  normalizeLandingLanguagePreferences,
} from "../../../../../lib/landing-language";
import { selectLocalizedComposition } from "../../../../../lib/landing-localization";
import {
  compositionHasLeadCapture,
  getLandingPageLeadForm,
} from "../../../../../lib/landing-page-forms";
import { LANDING_THEME_GLOBAL_CSS, resolveLandingTheme } from "../../../../../lib/landing-theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function anchorIdForSection(
  type: LandingPageComposition["sections"][number]["type"],
): string | null {
  if (type === "lead_form") return "lp-lead-form";
  if (type === "contact") return "lp-contact";
  return null;
}

type Props = {
  params: Promise<{
    tenantSlug: string;
    pageSlug: string;
    sitePageSlug: string;
  }>;
  searchParams?: Promise<{ lang?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { tenantSlug, pageSlug, sitePageSlug } = await params;

    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug));

    if (!tenant) return {};

    const [page] = await db
      .select({
        title: landingPages.title,
        metaTitle: landingPages.metaTitle,
        metaDescription: landingPages.metaDescription,
        ogImageUrl: landingPages.ogImageUrl,
        noindex: landingPages.noindex,
        status: landingPages.status,
        publishedVersionId: landingPages.publishedVersionId,
        currentVersionId: landingPages.currentVersionId,
      })
      .from(landingPages)
      .where(
        and(
          eq(landingPages.tenantId, tenant.id),
          eq(landingPages.slug, pageSlug),
          eq(landingPages.status, "published"),
        ),
      );

    const versionId = page?.publishedVersionId ?? page?.currentVersionId;
    if (!page || !versionId) return {};

    const [version] = await db
      .select({ composition: landingPageVersions.composition })
      .from(landingPageVersions)
      .where(
        and(eq(landingPageVersions.tenantId, tenant.id), eq(landingPageVersions.id, versionId)),
      );

    const composition = version?.composition as LandingPageComposition | undefined;
    const sitePage = composition ? getSitePage(composition, sitePageSlug) : null;
    if (!sitePage) return {};

    const title = sitePage.title ?? page.metaTitle ?? page.title;
    const description = sitePage.description ?? page.metaDescription ?? undefined;

    return {
      title,
      description,
      robots: page.noindex ? { index: false, follow: false } : undefined,
      openGraph: {
        title,
        description,
        images: page.ogImageUrl ? [{ url: page.ogImageUrl }] : undefined,
      },
    };
  } catch {
    return {};
  }
}

export default async function PublicLandingSitePage({ params, searchParams }: Props) {
  const { tenantSlug, pageSlug, sitePageSlug } = await params;
  const query = await searchParams;

  const [tenant] = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) notFound();

  const [page] = await db
    .select()
    .from(landingPages)
    .where(
      and(
        eq(landingPages.tenantId, tenant.id),
        eq(landingPages.slug, pageSlug),
        eq(landingPages.status, "published"),
      ),
    );

  const defaultVersionId = page?.publishedVersionId ?? page?.currentVersionId;
  if (!page || !defaultVersionId) notFound();

  const cookieStore = await cookies();
  const expCookieName = `__ev_${page.id.replace(/-/g, "")}`;
  const existingVariantId = cookieStore.get(expCookieName)?.value ?? null;

  let assignedVariantId: string | null = null;
  let versionId = defaultVersionId;

  const [activeExp] = await db
    .select({ id: landingPageExperiments.id })
    .from(landingPageExperiments)
    .where(
      and(
        eq(landingPageExperiments.tenantId, tenant.id),
        eq(landingPageExperiments.pageId, page.id),
        eq(landingPageExperiments.status, "running"),
      ),
    )
    .orderBy(desc(landingPageExperiments.createdAt))
    .limit(1);

  if (activeExp) {
    const expVariants = await db
      .select({
        id: experimentVariants.id,
        versionId: experimentVariants.versionId,
        trafficPct: experimentVariants.trafficPct,
      })
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, activeExp.id));

    if (expVariants.length >= 2) {
      if (existingVariantId && expVariants.some((v) => v.id === existingVariantId)) {
        assignedVariantId = existingVariantId;
      } else {
        const roll = Math.floor(Math.random() * 100);
        let cumulative = 0;
        for (const v of expVariants) {
          cumulative += v.trafficPct;
          if (roll < cumulative) {
            assignedVariantId = v.id;
            break;
          }
        }
        assignedVariantId ??= expVariants[0]!.id;
      }
      const assignedVar = expVariants.find((v) => v.id === assignedVariantId);
      if (assignedVar) versionId = assignedVar.versionId;
    }
  }

  const [version] = await db
    .select()
    .from(landingPageVersions)
    .where(and(eq(landingPageVersions.tenantId, tenant.id), eq(landingPageVersions.id, versionId)));

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

  void db
    .insert(landingPageViews)
    .values({
      tenantId: tenant.id,
      landingPageId: page.id,
      version: version.version,
      referrer: null,
      countryCode: null,
    })
    .catch(() => null);

  const hasLeadCapture = compositionHasLeadCapture(renderComposition);
  const form = hasLeadCapture
    ? await getLandingPageLeadForm(tenant.id, page.id).catch(() => null)
    : null;

  const [brand] = await db.select().from(brandAssets).where(eq(brandAssets.tenantId, tenant.id));

  const basePath = `/p/${tenantSlug}/${pageSlug}`;
  const theme = resolveLandingTheme({
    themeKey: page.themeKey,
    stepData,
    brandFallback: {
      colorPrimary: brand?.colorPrimary,
      colorSecondary: brand?.colorSecondary,
      fontHeading: brand?.fontHeading,
      fontBody: brand?.fontBody,
    },
  });

  return (
    <>
      <style href="landing-theme" precedence="default">
        {LANDING_THEME_GLOBAL_CSS}
      </style>
      {theme.googleFontsHref && <link rel="stylesheet" href={theme.googleFontsHref} />}
      {assignedVariantId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var cn="${expCookieName}",vid="${assignedVariantId}";if(!document.cookie.match("(^|;)\\\\s*"+cn+"\\\\s*=")){document.cookie=cn+"="+vid+"; max-age=2592000; path=/; SameSite=Lax";}window.__variantId=vid;})();`,
          }}
        />
      )}

      <div className="lp-themed-page" style={theme.cssVars}>
        <LandingSiteNav
          site={renderComposition.site}
          basePath={basePath}
          activePageSlug={sitePageSlug}
          brandPrimary={theme.brandPrimary}
          languagePreferences={languagePreferences}
          activeLocale={activeLocale}
        />

        {sections.map((section, i) => (
          <div key={i} id={`lp-section-${i}`} data-lp-section={i}>
            {anchorIdForSection(section.type) && (
              <div id={anchorIdForSection(section.type)!} style={{ scrollMarginTop: "110px" }} />
            )}
            <Reveal>
              <SectionBlock
                section={section}
                brandPrimary={theme.brandPrimary}
                leadFormFor={(s) =>
                  s.type === "lead_form" && form ? (
                    <LeadForm
                      tenantSlug={tenantSlug}
                      formSlug={form.slug}
                      schema={form.schema as Record<string, unknown>}
                      steps={form.steps as FormStep[] | undefined}
                      settings={form.settings as Partial<FormSettings> | undefined}
                      submitLabel={form.submitLabel ?? undefined}
                    />
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "2rem",
                        color: "var(--lp-muted,#9ca3af)",
                        fontSize: "0.875rem",
                      }}
                    >
                      Form not configured yet
                    </div>
                  )
                }
              />
            </Reveal>
          </div>
        ))}

        <LandingSiteFooter site={renderComposition.site} basePath={basePath} />
        <ConsentBanner tenantSlug={tenantSlug} brandPrimary={theme.brandPrimary} />
      </div>
    </>
  );
}
