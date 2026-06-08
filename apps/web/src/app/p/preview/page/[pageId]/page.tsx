// LP-5: Draft preview route for the visual editor.
// URL: /p/preview/page/<pageId> — renders the current (draft) version of a page.
// Access model: knows-the-UUID (no auth) — same model as Google Docs share-by-link.
// pageId is a v4 UUID so it's cryptographically unguessable. Used by the editor's
// preview iframe and to share unpublished drafts with collaborators.

import { db } from "@marketing/db";
import {
  landingPages,
  landingPageVersions,
  forms,
} from "@marketing/db";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { LandingPageComposition } from "@marketing/ai-router";
import LeadForm from "../../../../../components/lead-form";
import { SectionBlock } from "../../../../../components/landing/section-renderer";
import { PreviewSyncBridge } from "../../../../../components/landing/editor/preview-sync-bridge";
import {
  getTheme,
  getPalette,
  getFontPair,
  googleFontsUrlForPair,
} from "@marketing/landing-design-system";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ pageId: string }> };

export default async function DraftPreview({ params }: Props) {
  const { pageId } = await params;

  // Validate that pageId is a UUID before hitting the DB.
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

  if (!page?.currentVersionId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", textAlign: "center", padding: "2rem" }}>
        <div>
          <p style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</p>
          <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#111827" }}>Page is being generated…</p>
          <p style={{ fontSize: "0.9rem", color: "#6b7280", marginTop: "0.5rem" }}>The preview will appear here once your page is ready.</p>
        </div>
      </div>
    );
  }

  const [version] = await db
    .select({ composition: landingPageVersions.composition })
    .from(landingPageVersions)
    .where(and(eq(landingPageVersions.tenantId, page.tenantId), eq(landingPageVersions.id, page.currentVersionId)));

  if (!version) notFound();

  const composition = version.composition as LandingPageComposition;
  const sections = composition.sections.slice().sort((a, b) => a.order - b.order);

  // Resolve theme tokens. themeKey may be a Theme key (LP-3) or a Palette key (LP-4 wizard).
  const theme = page.themeKey ? getTheme(page.themeKey) : undefined;
  const palette = theme ? getPalette(theme.paletteKey) : (page.themeKey ? getPalette(page.themeKey) : undefined);
  const fontPairKey = (page.stepData as Record<string, unknown> | null)?.themeFontPair as string | undefined;
  const fontPair = fontPairKey ? getFontPair(fontPairKey) : (theme ? getFontPair(theme.fontPairKey) : undefined);

  const brandPrimary = palette?.colors.primary ?? "#7c3aed";
  const googleFontsHref = fontPair ? googleFontsUrlForPair(fontPair) : null;

  // Find a form for any lead_form section (any active form for this tenant).
  const leadFormSection = sections.find((s) => s.type === "lead_form");
  let form: { slug: string; schema: unknown } | null = null;
  if (leadFormSection) {
    const [f] = await db
      .select({ slug: forms.slug, schema: forms.schema })
      .from(forms)
      .where(and(eq(forms.tenantId, page.tenantId), eq(forms.isActive, true)))
      .limit(1);
    if (f) form = f;
  }

  const cssVars: React.CSSProperties = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(palette ? { ["--brand-primary" as any]: palette.colors.primary, ["--brand-secondary" as any]: palette.colors.secondary, ["--brand-accent" as any]: palette.colors.accent, ["--brand-surface" as any]: palette.colors.surface, ["--brand-text" as any]: palette.colors.text } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(fontPair ? { ["--font-heading" as any]: `'${fontPair.heading.family}', system-ui`, ["--font-body" as any]: `'${fontPair.body.family}', serif` } : {}),
  };

  return (
    <>
      {googleFontsHref && (
        // eslint-disable-next-line @next/next/no-css-tags
        <link rel="stylesheet" href={googleFontsHref} />
      )}
      <div style={cssVars}>
        <p style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#fef3c7", color: "#92400e", textAlign: "center", padding: "0.4rem 1rem", fontSize: "0.75rem", fontWeight: 600, zIndex: 9999, borderBottom: "1px solid #fcd34d" }}>
          📝 Draft preview — not visible to the public
        </p>
        <div style={{ paddingTop: "1.85rem" }}>
          {sections.map((section, i) => (
            <div key={i} id={`lp-section-${i}`} data-lp-section={i} style={{ scrollMarginTop: "1.85rem" }}>
              <SectionBlock
                section={section}
                brandPrimary={brandPrimary}
                leadFormFor={() => {
                  if (form) {
                    return (
                      <LeadForm
                        tenantSlug=""
                        formSlug={form.slug}
                        schema={form.schema as Record<string, unknown>}
                      />
                    );
                  }
                  return <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontStyle: "italic", border: "1px dashed #e5e7eb", borderRadius: 12 }}>[Lead form will render here]</div>;
                }}
              />
            </div>
          ))}
        </div>
        <PreviewSyncBridge />
      </div>
    </>
  );
}
