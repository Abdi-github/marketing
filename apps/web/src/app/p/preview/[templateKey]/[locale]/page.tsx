// Template preview route — internal use (gallery thumbnails, screenshot pipeline, in-app preview modal).
// URL: /p/preview/<templateKey>/<locale>
// noindex: true (this is internal, never search-indexed).
//
// Renders the template's sections_by_locale[locale] through the shared section-renderer,
// with the chosen theme bundle's brand color injected as CSS variables.

import { db, landingPageTemplates } from "@marketing/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { LandingPageSection } from "@marketing/ai-router";
import { isSwissLocale } from "@marketing/landing-design-system";
import { SectionBlock } from "../../../../../components/landing/section-renderer";
import { Reveal } from "../../../../../components/landing/reveal";
import { LANDING_THEME_GLOBAL_CSS, resolveLandingTheme } from "../../../../../lib/landing-theme";

export const revalidate = 3600; // 1-hour ISR — templates change rarely

type Props = {
  params: Promise<{ templateKey: string; locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { templateKey, locale } = await params;
  return {
    title: `Preview: ${templateKey} (${locale})`,
    robots: { index: false, follow: false },
  };
}

export default async function TemplatePreviewPage({ params }: Props) {
  const { templateKey, locale } = await params;

  if (!isSwissLocale(locale)) notFound();

  const [template] = await db
    .select()
    .from(landingPageTemplates)
    .where(eq(landingPageTemplates.key, templateKey));

  if (!template || !template.isActive) notFound();

  // Pick the requested locale's sections; fall back to de-CH then EN.
  const sectionsByLocale = (template.sectionsByLocale ?? {}) as Record<
    string,
    LandingPageSection[]
  >;
  const sections =
    sectionsByLocale[locale] ?? sectionsByLocale["de-CH"] ?? sectionsByLocale["en"] ?? [];

  if (sections.length === 0) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#6b7280" }}>
        <p>
          No content for {templateKey} in {locale}.
        </p>
      </div>
    );
  }

  // Resolve theme bundle → brand colors + font pair.
  const theme = resolveLandingTheme({ themeKey: template.themeKey });

  return (
    <>
      <style href="landing-theme" precedence="default">
        {LANDING_THEME_GLOBAL_CSS}
      </style>
      {theme.googleFontsHref && (
        <link rel="stylesheet" href={theme.googleFontsHref} precedence="default" />
      )}

      <div className="lp-themed-page" style={theme.cssVars}>
        {sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((section, i) => (
            <Reveal key={i}>
              <SectionBlock
                section={section}
                brandPrimary={theme.brandPrimary}
                leadFormFor={() => (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--lp-muted,#9ca3af)",
                      fontSize: "0.875rem",
                      fontStyle: "italic",
                    }}
                  >
                    [Lead form preview — actual form configured per tenant]
                  </div>
                )}
              />
            </Reveal>
          ))}
        <footer
          style={{
            background: "var(--lp-surface,#f9fafb)",
            color: "var(--lp-muted,#9ca3af)",
            textAlign: "center",
            padding: "1.5rem",
            fontSize: "0.75rem",
            borderTop: "1px solid var(--lp-subtle,#f3f4f6)",
          }}
        >
          <p style={{ margin: 0 }}>
            Template preview - {template.key} - {locale}
          </p>
        </footer>
      </div>
    </>
  );
}
