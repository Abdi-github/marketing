// Shared section renderer for landing pages.
// Used by:
//   1. Public landing page at /p/<tenant>/<slug>
//   2. Template preview at /p/preview/<templateKey>/<locale>
//
// SectionBlock dispatches (type, variant) → the matching variant component from ./sections/.
// Legacy sections without a variant field fall back to the default for that type.

import type {
  LandingPageSection,
  HeroSection,
  GallerySection,
  TestimonialsSection,
  FaqSection,
  MenuPreviewSection,
  OfferSection,
  ContactSection,
  AboutSection,
  WhatsappCtaSection,
} from "@marketing/ai-router";
import { normalizeVariant } from "@marketing/ai-router";
import type { ReactNode } from "react";

import {
  HeroCentered, HeroImageBgOverlay, HeroSplitImageRight, HeroSplitFormRight, HeroEditorialBold, HeroGradientSpotlight,
  AboutTextImageSplit, AboutTeamGrid, AboutValues3col,
  GalleryMasonry3, GalleryGrid2x2, GalleryCarouselStrip, GalleryFeatureSide,
  TestimonialsCards3col, TestimonialsLargeQuote, TestimonialsListWithAvatars, TestimonialsMarquee,
  MenuPreviewListBorders, MenuPreviewCardsGrid, MenuPreviewSplitImage,
  OfferBannerCentered, OfferSplitImagePrice, OfferCountdownBold,
  FAQAccordion, FAQTwoColumn, FAQNumberedList,
  ContactSplitMap, ContactCardsRow, ContactFullMapOverlay,
  LeadFormCardCentered, LeadFormSplitSideImage, LeadFormFullWidthBar,
  WhatsAppCtaCenteredButton, WhatsAppCtaBannerStrip,
} from "./sections";

// ─── Shared layout primitives (still used by consumers outside this file) ─────

export const S = {
  eyebrow: (color: string) => ({
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color,
    marginBottom: "0.75rem",
    textAlign: "center" as const,
  }),
  sectionHeading: (centered = true) => ({
    fontFamily: "var(--font-heading, system-ui)",
    fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
    fontWeight: 800,
    color: "#111827",
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
    marginBottom: "1rem",
    ...(centered ? { textAlign: "center" as const } : {}),
  }),
  lead: (centered = true) => ({
    fontSize: "1.05rem",
    color: "#6b7280",
    lineHeight: 1.75,
    ...(centered ? { textAlign: "center" as const, maxWidth: 540, margin: "0 auto" } : {}),
  }),
  container: (maxW = 960) => ({
    maxWidth: maxW,
    margin: "0 auto",
    padding: "0 1.5rem",
  }),
  section: (bg = "#fff") => ({
    padding: "5.5rem 0",
    background: bg,
  }),
};

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function SectionBlock({
  section,
  brandPrimary,
  leadFormFor,
}: {
  section: LandingPageSection;
  brandPrimary: string;
  /** Per-section callback for the lead_form variant. Returns the form node (or a placeholder). */
  leadFormFor: (section: LandingPageSection) => ReactNode;
}) {
  const bp = brandPrimary;

  switch (section.type) {
    case "hero": {
      const v = normalizeVariant("hero", section.variant);
      const s = section as HeroSection;
      if (v === "image-bg-overlay")  return <HeroImageBgOverlay section={s} brandPrimary={bp} />;
      if (v === "split-image-right") return <HeroSplitImageRight section={s} brandPrimary={bp} />;
      if (v === "split-form-right")  return <HeroSplitFormRight section={s} brandPrimary={bp} />;
      if (v === "editorial-bold")    return <HeroEditorialBold section={s} brandPrimary={bp} />;
      if (v === "gradient-spotlight") return <HeroGradientSpotlight section={s} brandPrimary={bp} />;
      return <HeroCentered section={s} brandPrimary={bp} />;
    }

    case "about": {
      const v = normalizeVariant("about", section.variant);
      const s = section as AboutSection;
      const dark = section.tone === "dark";
      if (v === "team-grid")    return <AboutTeamGrid section={s} brandPrimary={bp} />;
      if (v === "values-3col")  return <AboutValues3col section={s} brandPrimary={bp} darkMode={dark} />;
      return <AboutTextImageSplit section={s} brandPrimary={bp} />;
    }

    case "gallery": {
      const v = normalizeVariant("gallery", section.variant);
      const s = section as GallerySection;
      if (v === "grid-2x2")        return <GalleryGrid2x2 section={s} brandPrimary={bp} />;
      if (v === "carousel-strip")  return <GalleryCarouselStrip section={s} brandPrimary={bp} />;
      if (v === "feature-side")    return <GalleryFeatureSide section={s} brandPrimary={bp} />;
      return <GalleryMasonry3 section={s} brandPrimary={bp} />;
    }

    case "testimonials": {
      const v = normalizeVariant("testimonials", section.variant);
      const s = section as TestimonialsSection;
      const dark = section.tone === "dark";
      if (v === "large-quote")        return <TestimonialsLargeQuote section={s} brandPrimary={bp} darkMode={dark} />;
      if (v === "list-with-avatars")  return <TestimonialsListWithAvatars section={s} brandPrimary={bp} darkMode={dark} />;
      if (v === "marquee")            return <TestimonialsMarquee section={s} brandPrimary={bp} />;
      return <TestimonialsCards3col section={s} brandPrimary={bp} darkMode={dark} />;
    }

    case "menu_preview": {
      const v = normalizeVariant("menu_preview", section.variant);
      const s = section as MenuPreviewSection;
      if (v === "cards-grid")   return <MenuPreviewCardsGrid section={s} brandPrimary={bp} />;
      if (v === "split-image")  return <MenuPreviewSplitImage section={s} brandPrimary={bp} />;
      return <MenuPreviewListBorders section={s} brandPrimary={bp} />;
    }

    case "offer": {
      const v = normalizeVariant("offer", section.variant);
      const s = section as OfferSection;
      const accent = section.tone === "accent";
      if (v === "split-image-price")  return <OfferSplitImagePrice section={s} brandPrimary={bp} />;
      if (v === "countdown-bold")     return <OfferCountdownBold section={s} brandPrimary={bp} />;
      return <OfferBannerCentered section={s} brandPrimary={bp} accentMode={accent} />;
    }

    case "faq": {
      const v = normalizeVariant("faq", section.variant);
      const s = section as FaqSection;
      const dark = section.tone === "dark";
      if (v === "two-column")    return <FAQTwoColumn section={s} brandPrimary={bp} />;
      if (v === "numbered-list") return <FAQNumberedList section={s} brandPrimary={bp} />;
      return <FAQAccordion section={s} brandPrimary={bp} darkMode={dark} />;
    }

    case "contact": {
      const v = normalizeVariant("contact", section.variant);
      const s = section as ContactSection;
      const dark = section.tone === "dark";
      if (v === "cards-row")          return <ContactCardsRow section={s} brandPrimary={bp} darkMode={dark} />;
      if (v === "full-map-overlay")   return <ContactFullMapOverlay section={s} brandPrimary={bp} />;
      return <ContactSplitMap section={s} brandPrimary={bp} />;
    }

    case "lead_form": {
      const v = normalizeVariant("lead_form", section.variant);
      const formContent = leadFormFor(section);
      const accent = section.tone === "accent";
      if (v === "split-side-image")  return <LeadFormSplitSideImage section={section} brandPrimary={bp} formContent={formContent} />;
      if (v === "full-width-bar")    return <LeadFormFullWidthBar section={section} brandPrimary={bp} formContent={formContent} accentMode={accent} />;
      return <LeadFormCardCentered section={section} brandPrimary={bp} formContent={formContent} />;
    }

    case "whatsapp_cta": {
      const v = normalizeVariant("whatsapp_cta", section.variant);
      const s = section as WhatsappCtaSection;
      if (v === "banner-strip") return <WhatsAppCtaBannerStrip section={s} brandPrimary={bp} />;
      return <WhatsAppCtaCenteredButton section={s} brandPrimary={bp} />;
    }
  }
}

// ─── Individual block exports (kept for backwards compat, now thin wrappers) ──

export function HeroBlock({ section, brandPrimary }: { section: HeroSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function AboutBlock({ section, brandPrimary }: { section: AboutSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function GalleryBlock({ section, brandPrimary }: { section: GallerySection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function TestimonialsBlock({ section, brandPrimary }: { section: TestimonialsSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function MenuPreviewBlock({ section, brandPrimary }: { section: MenuPreviewSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function OfferBlock({ section, brandPrimary }: { section: OfferSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function FAQBlock({ section, brandPrimary }: { section: FaqSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function ContactBlock({ section, brandPrimary }: { section: ContactSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function WhatsAppCtaBlock({ section, brandPrimary }: { section: WhatsappCtaSection; brandPrimary: string }) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => null} />;
}
export function LeadFormBlock({
  section,
  brandPrimary,
  formContent,
}: {
  section: LandingPageSection;
  brandPrimary: string;
  formContent: ReactNode;
}) {
  return <SectionBlock section={section} brandPrimary={brandPrimary} leadFormFor={() => formContent} />;
}
