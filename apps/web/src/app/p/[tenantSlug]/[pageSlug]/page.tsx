// Public landing page render.
// URL: /p/<tenantSlug>/<pageSlug> — no auth, locale-free.
// Excluded from next-intl middleware via the matcher pattern in middleware.ts.
// Section components live in apps/web/src/components/landing/section-renderer.tsx
// (shared with the template preview route at /p/_preview/<key>/<locale>).
import { db } from "@marketing/db";
import {
  landingPages,
  landingPageVersions,
  landingPageViews,
  landingPageExperiments,
  experimentVariants,
  tenants,
  forms,
  brandAssets,
} from "@marketing/db";
import { and, eq, desc } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { LandingPageComposition } from "@marketing/ai-router";
import LeadForm from "../../../../components/lead-form";
import { SectionBlock } from "../../../../components/landing/section-renderer";
import { ConsentBanner } from "./consent-banner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ tenantSlug: string; pageSlug: string }>;
};

// ─── SEO metadata ─────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenantSlug, pageSlug } = await params;

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
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.tenantId, tenant.id),
        eq(landingPages.slug, pageSlug),
        eq(landingPages.status, "published"),
      ),
    );

  if (!page) return {};

  const title = page.metaTitle ?? page.title;
  const description = page.metaDescription ?? undefined;

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
}

// ─── Page render ──────────────────────────────────────────────────────────────

export default async function PublicLandingPage({ params }: Props) {
  const { tenantSlug, pageSlug } = await params;

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

  // ─── A/B experiment variant assignment ────────────────────────────────────
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
      .select({ id: experimentVariants.id, versionId: experimentVariants.versionId, trafficPct: experimentVariants.trafficPct })
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
    .where(
      and(
        eq(landingPageVersions.tenantId, tenant.id),
        eq(landingPageVersions.id, versionId),
      ),
    );

  if (!version) notFound();

  void db.insert(landingPageViews).values({
    tenantId: tenant.id,
    landingPageId: page.id,
    version: version.version,
    referrer: null,
    countryCode: null,
  }).catch(() => null);

  const composition = version.composition as LandingPageComposition;

  const [form] = await db
    .select({ id: forms.id, slug: forms.slug, schema: forms.schema, name: forms.name })
    .from(forms)
    .where(
      and(
        eq(forms.tenantId, tenant.id),
        eq(forms.landingPageId, page.id),
        eq(forms.isActive, true),
      ),
    );

  const [brand] = await db
    .select()
    .from(brandAssets)
    .where(eq(brandAssets.tenantId, tenant.id));

  const primary = brand?.colorPrimary ?? "#111827";
  const secondary = brand?.colorSecondary ?? "#6b7280";
  const fontHeading = brand?.fontHeading ?? "system-ui";
  const fontBody = brand?.fontBody ?? "system-ui";

  const cssVars = [
    `--brand-primary: ${primary}`,
    `--brand-secondary: ${secondary}`,
    `--font-heading: ${fontHeading}`,
    `--font-body: ${fontBody}`,
  ].join("; ");

  return (
    <>
      <style href="brand-vars" precedence="default">{`:root { ${cssVars} } *, *::before, *::after { box-sizing: border-box; } body { margin: 0; }`}</style>
      {/* A/B experiment: set variant cookie + expose variant_id for track.js */}
      {assignedVariantId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var cn="${expCookieName}",vid="${assignedVariantId}";if(!document.cookie.match("(^|;)\\\\s*"+cn+"\\\\s*=")){document.cookie=cn+"="+vid+"; max-age=2592000; path=/; SameSite=Lax";}window.__variantId=vid;})();`,
          }}
        />
      )}

      <div style={{ fontFamily: `var(--font-body, ${fontBody}, system-ui, sans-serif)`, background: "#fff" }}>
        {composition.sections
          .sort((a, b) => a.order - b.order)
          .map((section, i) => (
            <SectionBlock
              key={i}
              section={section}
              brandPrimary={primary}
              leadFormFor={(s) =>
                s.type === "lead_form" && form ? (
                  <LeadForm tenantSlug={tenantSlug} formSlug={form.slug} schema={form.schema as Record<string, unknown>} />
                ) : (
                  <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af", fontSize: "0.875rem" }}>
                    Form not configured yet
                  </div>
                )
              }
            />
          ))}
      </div>

      {/* Footer */}
      <footer style={{ background: "#111827", color: "#6b7280", textAlign: "center", padding: "2.5rem 1.5rem", fontSize: "0.8rem" }}>
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} — All rights reserved</p>
      </footer>

      <ConsentBanner tenantSlug={tenantSlug} brandPrimary={primary} />
    </>
  );
}
