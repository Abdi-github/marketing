import { z } from "zod";

// ─── Per-type extras schemas ───────────────────────────────────────────────────
// Each section type carries typed, optional `extras` that the layout AI populates.
// All sub-fields are optional so old compositions (pre-step-23) still parse.

export const heroExtrasSchema = z.object({
  ctaText: z.string().max(80).optional(),
  ctaHref: z.string().max(300).optional(),
  backgroundImageUrl: z.string().max(500).optional(),
}).optional();

export const galleryExtrasSchema = z.object({
  images: z.array(z.object({
    url: z.string().max(500),
    caption: z.string().max(200).optional(),
  })).max(12).optional(),
}).optional();

export const testimonialsExtrasSchema = z.object({
  items: z.array(z.object({
    quote: z.string().max(500),
    author: z.string().max(100),
    role: z.string().max(100).optional(),
    avatarUrl: z.string().max(500).optional(),
    rating: z.number().min(1).max(5).optional(),
  })).max(6).optional(),
}).optional();

export const faqExtrasSchema = z.object({
  items: z.array(z.object({
    question: z.string().max(300),
    answer: z.string().max(1000),
  })).max(10).optional(),
}).optional();

export const menuPreviewExtrasSchema = z.object({
  items: z.array(z.object({
    name: z.string().max(100),
    price: z.string().max(20).optional(),
    description: z.string().max(300).optional(),
    imageUrl: z.string().max(500).optional(),
  })).max(12).optional(),
}).optional();

export const offerExtrasSchema = z.object({
  price: z.string().max(50).optional(),
  oldPrice: z.string().max(50).optional(),
  validUntil: z.string().max(100).optional(),
  ctaText: z.string().max(80).optional(),
  ctaHref: z.string().max(300).optional(),
}).optional();

export const contactExtrasSchema = z.object({
  email: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  mapEmbedUrl: z.string().max(500).optional(),
  openingHours: z.string().max(200).optional(),
}).optional();

export const aboutExtrasSchema = z.object({
  /** Main side image for the text-image-split variant. */
  imageUrl: z.string().max(500).optional(),
  teamMembers: z.array(z.object({
    name: z.string().max(100),
    role: z.string().max(100).optional(),
    photoUrl: z.string().max(500).optional(),
  })).max(8).optional(),
  values: z.array(z.string().max(150)).max(6).optional(),
}).optional();

export const leadFormExtrasSchema = z.object({}).optional();

export const whatsappCtaExtrasSchema = z.object({
  phoneNumber: z.string().max(20).optional(),
  prefillText: z.string().max(300).optional(),
  buttonText: z.string().max(80).optional(),
}).optional();

// ─── Discriminated union section schema ────────────────────────────────────────
// Each type carries a well-typed `extras` shape.
// Discriminating on `type` gives TypeScript full type narrowing in renderers.

const baseSection = {
  order: z.number().int().min(0),
  heading: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  /** LP-1: variant key from SECTION_VARIANTS registry. Optional for backwards-compatibility; renderer falls back to the type's DEFAULT_VARIANT. */
  variant: z.string().min(1).max(60).optional(),
};

export const heroSectionSchema = z.object({
  ...baseSection,
  type: z.literal("hero"),
  extras: heroExtrasSchema,
});

export const gallerySectionSchema = z.object({
  ...baseSection,
  type: z.literal("gallery"),
  extras: galleryExtrasSchema,
});

export const testimonialsSectionSchema = z.object({
  ...baseSection,
  type: z.literal("testimonials"),
  extras: testimonialsExtrasSchema,
});

export const faqSectionSchema = z.object({
  ...baseSection,
  type: z.literal("faq"),
  extras: faqExtrasSchema,
});

export const menuPreviewSectionSchema = z.object({
  ...baseSection,
  type: z.literal("menu_preview"),
  extras: menuPreviewExtrasSchema,
});

export const offerSectionSchema = z.object({
  ...baseSection,
  type: z.literal("offer"),
  extras: offerExtrasSchema,
});

export const contactSectionSchema = z.object({
  ...baseSection,
  type: z.literal("contact"),
  extras: contactExtrasSchema,
});

export const aboutSectionSchema = z.object({
  ...baseSection,
  type: z.literal("about"),
  extras: aboutExtrasSchema,
});

export const leadFormSectionSchema = z.object({
  ...baseSection,
  type: z.literal("lead_form"),
  extras: leadFormExtrasSchema,
});

export const whatsappCtaSectionSchema = z.object({
  ...baseSection,
  type: z.literal("whatsapp_cta"),
  extras: whatsappCtaExtrasSchema,
});

export const sectionTypeEnum = z.enum([
  "hero",
  "about",
  "menu_preview",
  "offer",
  "gallery",
  "testimonials",
  "faq",
  "contact",
  "lead_form",
  "whatsapp_cta",
]);
export type SectionType = z.infer<typeof sectionTypeEnum>;

export const landingPageSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  gallerySectionSchema,
  testimonialsSectionSchema,
  faqSectionSchema,
  menuPreviewSectionSchema,
  offerSectionSchema,
  contactSectionSchema,
  aboutSectionSchema,
  leadFormSectionSchema,
  whatsappCtaSectionSchema,
]);

export type LandingPageSection = z.infer<typeof landingPageSectionSchema>;

// Convenience: extras type per section variant
export type HeroSection = z.infer<typeof heroSectionSchema>;
export type GallerySection = z.infer<typeof gallerySectionSchema>;
export type TestimonialsSection = z.infer<typeof testimonialsSectionSchema>;
export type FaqSection = z.infer<typeof faqSectionSchema>;
export type MenuPreviewSection = z.infer<typeof menuPreviewSectionSchema>;
export type OfferSection = z.infer<typeof offerSectionSchema>;
export type ContactSection = z.infer<typeof contactSectionSchema>;
export type AboutSection = z.infer<typeof aboutSectionSchema>;
export type LeadFormSection = z.infer<typeof leadFormSectionSchema>;
export type WhatsappCtaSection = z.infer<typeof whatsappCtaSectionSchema>;

export const landingPageCompositionSchema = z.object({
  sections: z.array(landingPageSectionSchema).min(2).max(8),
  /** Locale tag (e.g. "de-CH"). */
  locale: z.string().default("de-CH"),
  /** Generated page title. */
  title: z.string().min(1).max(150),
});

export type LandingPageComposition = z.infer<typeof landingPageCompositionSchema>;

// ─── Job step enum ────────────────────────────────────────────────────────────

export const landingPageStepEnum = z.enum(["brief", "copy", "layout", "publish"]);
export type LandingPageStep = z.infer<typeof landingPageStepEnum>;

// ─── Job payload schema ───────────────────────────────────────────────────────
// Shared between the FlowProducer (producer) and the worker handler (consumer).

export const landingPageJobSchema = z.object({
  tenantId: z.string().uuid(),
  /** Stable identifier for this page (row in landing_pages). */
  landingPageId: z.string().uuid(),
  userId: z.string().uuid(),
  businessName: z.string().min(1).max(200),
  vertical: z.string().min(2).max(100),
  city: z.string().max(100).optional(),
  locale: z.string().default("de-CH"),
  /** Free-text user brief. Used as seed for the brief step. */
  userPrompt: z.string().min(3).max(1000),
  /** Template key (e.g. "cafe-bold") when the user picked a template. Undefined for from-scratch. */
  templateKey: z.string().optional(),
  /**
   * Whether to fold the tenant's brand context (about/menu/offer/faq embeddings) into the brief.
   * Default false: keep the template's own voice + theme. Set true only when the user opts in to
   * "apply my brand". Read by the brief step (worker) to decide whether to retrieve brand chunks.
   */
  applyBrand: z.boolean().optional(),
  /** Which step this job handles. Set by FlowProducer per child node. */
  step: landingPageStepEnum,
  /** BullMQ idempotency key per step. Equals `${landingPageId}:${step}`. */
  idempotencyKey: z.string(),
  promptId: z.string(),
  promptVersion: z.number().int().positive(),
  /** Per-job hard cost cap in US cents. Default 50¢. */
  costBudgetCents: z.number().int().positive().default(50),
});

export type LandingPageJob = z.infer<typeof landingPageJobSchema>;

export const LANDING_PAGE_QUEUE_NAME = "ai.landing_page.compose" as const;
