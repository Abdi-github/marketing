// Lightweight card-thumbnail preview — used only in template gallery cards.
// Differences from the full preview route:
//   - 24h ISR cache (templates don't change between sessions)
//   - No external font requests (system fonts only) — eliminates the biggest latency source
//   - Only the top 2 sections (hero + one more) — reduces render time and image fetches
//   - noindex, no footer
//   - sandbox="allow-same-origin" in the caller (no JS needed here)

import { db, landingPageTemplates } from "@marketing/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { LandingPageSection } from "@marketing/ai-router";
import { isSwissLocale } from "@marketing/landing-design-system";
import { SectionBlock } from "../../../../../components/landing/section-renderer";
import { LANDING_THEME_GLOBAL_CSS, resolveLandingTheme } from "../../../../../lib/landing-theme";

export const revalidate = 86400; // 24-hour ISR

type Props = {
  params: Promise<{ templateKey: string; locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { templateKey, locale } = await params;
  return {
    title: `Card preview: ${templateKey} (${locale})`,
    robots: { index: false, follow: false },
  };
}

export default async function CardPreviewPage({ params }: Props) {
  const { templateKey, locale } = await params;

  if (!isSwissLocale(locale)) notFound();

  const [template] = await db
    .select()
    .from(landingPageTemplates)
    .where(eq(landingPageTemplates.key, templateKey));

  if (!template || !template.isActive) notFound();

  const sectionsByLocale = (template.sectionsByLocale ?? {}) as Record<
    string,
    LandingPageSection[]
  >;

  // Only the first 2 sections — hero is always first, gives the visual impression needed.
  const sections = (
    sectionsByLocale[locale] ??
    sectionsByLocale["de-CH"] ??
    sectionsByLocale["en"] ??
    []
  )
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 2);

  if (sections.length === 0) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#6b7280" }}>
        <p>No content for {templateKey}.</p>
      </div>
    );
  }

  // Resolve theme colors but skip Google Fonts entirely — system fonts are fine
  // for a 220px-tall scaled thumbnail.
  const theme = resolveLandingTheme({ themeKey: template.themeKey });

  return (
    <>
      <style href="landing-theme" precedence="default">
        {LANDING_THEME_GLOBAL_CSS}
      </style>

      <div className="lp-themed-page" style={theme.cssVars}>
        {sections.map((section, i) => (
          <SectionBlock
            key={i}
            section={section}
            brandPrimary={theme.brandPrimary}
            leadFormFor={() => (
              <div
                style={{
                  textAlign: "center",
                  padding: "2rem",
                  color: "var(--lp-muted,#9ca3af)",
                  fontSize: "0.875rem",
                }}
              >
                [Form]
              </div>
            )}
          />
        ))}
      </div>
    </>
  );
}
