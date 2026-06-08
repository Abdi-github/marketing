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
import {
  getTheme,
  getPalette,
  getFontPair,
  isSwissLocale,
} from "@marketing/landing-design-system";
import { SectionBlock } from "../../../../../components/landing/section-renderer";

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
    sectionsByLocale[locale] ??
    sectionsByLocale["de-CH"] ??
    sectionsByLocale["en"] ??
    [];

  if (sections.length === 0) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#6b7280" }}>
        <p>No content for {templateKey} in {locale}.</p>
      </div>
    );
  }

  // Resolve theme bundle → brand colors + font pair.
  const theme = template.themeKey ? getTheme(template.themeKey) : undefined;
  const palette = theme ? getPalette(theme.paletteKey) : undefined;
  const fontPair = theme ? getFontPair(theme.fontPairKey) : undefined;

  const primary = palette?.colors.primary ?? "#111827";
  const secondary = palette?.colors.secondary ?? "#6b7280";
  const fontHeading = fontPair?.heading.family
    ? `'${fontPair.heading.family}', ${fontPair.heading.fallback}`
    : "system-ui";
  const fontBody = fontPair?.body.family
    ? `'${fontPair.body.family}', ${fontPair.body.fallback}`
    : "system-ui";

  // Google Fonts URL for the chosen pair (one network request).
  let fontHref: string | null = null;
  if (fontPair) {
    const dedup =
      fontPair.heading.family === fontPair.body.family
        ? [fontPair.heading]
        : [fontPair.heading, fontPair.body];
    const params = dedup
      .map((f) => `family=${f.family.replace(/ /g, "+")}:wght@${f.weights.join(";")}`)
      .join("&");
    fontHref = `https://fonts.googleapis.com/css2?${params}&display=swap`;
  }

  const cssVars = [
    `--brand-primary: ${primary}`,
    `--brand-secondary: ${secondary}`,
    `--font-heading: ${fontHeading}`,
    `--font-body: ${fontBody}`,
  ].join("; ");

  return (
    <>
      <style href="theme-vars" precedence="default">
        {`:root { ${cssVars} } *, *::before, *::after { box-sizing: border-box; } body { margin: 0; }`}
      </style>
      {fontHref && (
        // eslint-disable-next-line @next/next/no-css-tags
        <link rel="stylesheet" href={fontHref} precedence="default" />
      )}

      <div style={{ fontFamily: `var(--font-body, ${fontBody}, system-ui, sans-serif)`, background: "#fff" }}>
        {sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((section, i) => (
            <SectionBlock
              key={i}
              section={section}
              brandPrimary={primary}
              leadFormFor={() => (
                <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af", fontSize: "0.875rem", fontStyle: "italic" }}>
                  [Lead form preview — actual form configured per tenant]
                </div>
              )}
            />
          ))}
      </div>

      <footer style={{ background: "#f9fafb", color: "#9ca3af", textAlign: "center", padding: "1.5rem", fontSize: "0.75rem", borderTop: "1px solid #f3f4f6" }}>
        <p style={{ margin: 0 }}>Template preview · {template.key} · {locale}</p>
      </footer>
    </>
  );
}
