import { z } from "zod";

export const socialCreativeAspectRatioSchema = z.enum(["1:1", "4:5", "9:16"]);
export const socialCreativeTemplateSchema = z.enum([
  "auto",
  "promo-badge",
  "editorial-collage",
  "event-poster",
  "story-card",
  "retail-offer",
  "product-hero",
  "testimonial-proof",
  "carousel-cover",
]);
export const resolvedSocialCreativeTemplateSchema = z.enum([
  "promo-badge",
  "editorial-collage",
  "event-poster",
  "story-card",
  "retail-offer",
  "product-hero",
  "testimonial-proof",
  "carousel-cover",
]);
export const socialCreativeToneSchema = z.enum(["promo", "editorial", "event", "story"]);

export const socialCreativePlanSchema = z.object({
  version: z.literal(1),
  template: resolvedSocialCreativeTemplateSchema,
  aspectRatio: socialCreativeAspectRatioSchema,
  headline: z.string().min(1).max(90),
  subheading: z.string().min(1).max(180),
  badge: z.string().min(1).max(40),
  cta: z.string().min(1).max(40),
  footer: z.string().min(1).max(80),
  visualCue: z.string().min(1).max(40),
  visualMotif: z.string().min(1).max(80).optional(),
  backgroundStyle: z
    .enum(["product-scene", "pattern", "photo-led", "typographic", "editorial"])
    .optional(),
  backgroundImageUrl: z.string().url().optional(),
  backgroundModel: z.string().min(1).max(120).optional(),
  tone: socialCreativeToneSchema,
});

export type SocialCreativeAspectRatio = z.infer<typeof socialCreativeAspectRatioSchema>;
export type SocialCreativeTemplate = z.infer<typeof socialCreativeTemplateSchema>;
export type ResolvedSocialCreativeTemplate = z.infer<typeof resolvedSocialCreativeTemplateSchema>;
export type SocialCreativePlan = z.infer<typeof socialCreativePlanSchema>;

export const socialCreativeJobSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  postJobId: z.string().uuid(),
  aspectRatio: socialCreativeAspectRatioSchema.default("4:5"),
  template: socialCreativeTemplateSchema.default("auto"),
  idempotencyKey: z.string().uuid(),
  promptId: z.string().default("social-creative-plan-v1"),
  promptVersion: z.number().int().positive().default(1),
  costBudgetCents: z.number().int().positive().default(20),
  creativeDirection: z.string().max(600).optional(),
  variantNonce: z.string().max(80).optional(),
  renderAppUrl: z.string().url().optional(),
  deadline: z.string().datetime().optional(),
});

export type SocialCreativeJob = z.infer<typeof socialCreativeJobSchema>;

export const SOCIAL_CREATIVE_QUEUE_NAME = "ai.social_creative.generate" as const;
export const SOCIAL_CREATIVE_ASPECT_RATIOS = socialCreativeAspectRatioSchema.options;
export const SOCIAL_CREATIVE_TEMPLATES = socialCreativeTemplateSchema.options;

type BuildSocialCreativePlanInput = {
  businessName: string;
  vertical?: string | null;
  city?: string | null;
  topic?: string | null;
  highlights?: string | null;
  postText: string;
  imageUrl?: string | null;
  creativeDirection?: string | null;
  aspectRatio?: SocialCreativeAspectRatio;
  template?: SocialCreativeTemplate;
};

export function getSocialCreativeDimensions(aspectRatio: SocialCreativeAspectRatio): {
  width: number;
  height: number;
} {
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  return { width: 1080, height: 1080 };
}

export function getSocialCreativePath(
  jobId: string,
  version?: string | number | Date | null,
): string {
  const suffix =
    version instanceof Date
      ? version.getTime()
      : version !== undefined && version !== null
        ? String(version)
        : "latest";
  return `/api/social-creatives/${jobId}/image?v=${encodeURIComponent(suffix)}`;
}

export function getSocialCreativePublicUrl(
  appUrl: string,
  jobId: string,
  version?: string | number | Date | null,
): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}${getSocialCreativePath(jobId, version)}`;
}

export function parsePromptInput(input: unknown): { topic: string; highlights: string } {
  if (!input || typeof input !== "object") return { topic: "", highlights: "" };
  const record = input as Record<string, unknown>;
  return {
    topic: typeof record["topic"] === "string" ? record["topic"] : "",
    highlights: typeof record["highlights"] === "string" ? record["highlights"] : "",
  };
}

export function parseSocialCreativePlan(input: unknown): SocialCreativePlan | null {
  const result = socialCreativePlanSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function extractSocialCreativePlanFromText(text: string): SocialCreativePlan | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1],
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const result = parseSocialCreativePlan(parsed);
      if (result) return result;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export function buildSocialCreativePlan(input: BuildSocialCreativePlanInput): SocialCreativePlan {
  const topic = clean(input.topic) || firstSentence(input.postText) || input.businessName;
  const highlights = clean(input.highlights);
  const postSummary = firstSentence(input.postText);
  const creativeDirection = clean(input.creativeDirection);
  const aspectRatio = input.aspectRatio ?? "4:5";
  const template = resolveTemplate({
    requested: input.template ?? "auto",
    topic,
    highlights,
    postText: input.postText,
    imageUrl: input.imageUrl,
  });
  const tone = templateTone(template);
  const headline = clampWords(
    toTitleLine(topic || postSummary),
    template === "event-poster" ? 5 : 7,
  );
  const subheading = clampWords(
    highlights || postSummary || topic,
    aspectRatio === "9:16" ? 13 : 11,
  );
  const badge = buildBadge({ topic, highlights, postText: input.postText, tone });
  const cta = buildCta({ tone, vertical: input.vertical, postText: input.postText });
  const city = clean(input.city);
  const footer = city ? `${input.businessName} - ${city}` : input.businessName;
  const visualMotif = inferVisualMotif(
    creativeDirection || highlights || topic || input.postText,
    input.vertical,
  );

  return {
    version: 1,
    template,
    aspectRatio,
    headline,
    subheading,
    badge,
    cta,
    footer,
    visualCue: input.imageUrl ? "photo" : verticalCue(input.vertical),
    visualMotif,
    backgroundStyle: input.imageUrl ? "photo-led" : inferBackgroundStyle(template, visualMotif),
    tone,
  };
}

function resolveTemplate(input: {
  requested: SocialCreativeTemplate;
  topic: string;
  highlights: string;
  postText: string;
  imageUrl?: string | null;
}): ResolvedSocialCreativeTemplate {
  if (input.requested !== "auto") return input.requested;
  const haystack = `${input.topic} ${input.highlights} ${input.postText}`.toLowerCase();
  if (/review|testimonial|avis|bewertung|recensione|kundenstimme|client/i.test(haystack)) {
    return "testimonial-proof";
  }
  if (
    /\b(event|festival|ticket|workshop|kurs|degustation|webinar|opening|vernissage)\b/i.test(
      haystack,
    )
  ) {
    return "event-poster";
  }
  if (/%|rabatt|aktion|angebot|sale|offre|sconto|promo|win|gagne|gewinn/i.test(haystack)) {
    if (
      /vegetable|fruit|gemuese|gemÃ¼se|legume|verdura|product|retail|shop|store|boutique/i.test(
        haystack,
      )
    ) {
      return "retail-offer";
    }
    return "promo-badge";
  }
  if (/launch|new|neu|nouveau|nuovo|product|produit|produkt|prodotto/i.test(haystack)) {
    return "product-hero";
  }
  if (/tip|guide|how to|warum|pourquoi|perche|perché|benefit|vorteil/i.test(haystack)) {
    return "carousel-cover";
  }
  if (input.imageUrl) return "story-card";
  return "editorial-collage";
}

function templateTone(template: ResolvedSocialCreativeTemplate): SocialCreativePlan["tone"] {
  if (template === "promo-badge") return "promo";
  if (template === "retail-offer" || template === "product-hero") return "promo";
  if (template === "event-poster") return "event";
  if (
    template === "story-card" ||
    template === "testimonial-proof" ||
    template === "carousel-cover"
  )
    return "story";
  return "editorial";
}

function buildBadge(input: {
  topic: string;
  highlights: string;
  postText: string;
  tone: SocialCreativePlan["tone"];
}): string {
  const text = `${input.topic} ${input.highlights} ${input.postText}`;
  const discount = text.match(/(?:\d{1,2}\s?[-]\s?\d{1,2}|\d{1,2})\s?%/);
  if (discount) return discount[0].replace(/\s+/g, "");
  if (input.tone === "event") {
    const date = text.match(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/);
    return date?.[0] ?? "Save the date";
  }
  if (/review|testimonial|avis|bewertung|recensione|kundenstimme/i.test(text)) return "5 stars";
  if (/new|neu|nouveau|nuovo/i.test(text)) return "New";
  if (/win|gewinn|gagne|vinci/i.test(text)) return "Win";
  if (input.tone === "promo") return "Offer";
  return "Fresh pick";
}

function buildCta(input: {
  tone: SocialCreativePlan["tone"];
  vertical?: string | null;
  postText: string;
}): string {
  const text = input.postText.toLowerCase();
  if (/reserv|book|termin|appointment|prenot|reserve/i.test(text)) return "Book now";
  if (/ticket|event|festival|kurs|workshop/i.test(text)) return "Get tickets";
  if (/shop|buy|order|bestell|commande|ordina/i.test(text)) return "Shop now";
  if (input.tone === "promo") return "See offer";
  if (input.vertical && /restaurant|cafe|bar|food/i.test(input.vertical)) return "Visit us";
  return "Learn more";
}

function verticalCue(vertical?: string | null): string {
  const normalized = (vertical ?? "").toLowerCase();
  if (/restaurant|cafe|bar|food/.test(normalized)) return "table";
  if (/retail|shop|store|boutique/.test(normalized)) return "product";
  if (/fitness|gym|studio|yoga/.test(normalized)) return "movement";
  if (/clinic|health|medical|therapy/.test(normalized)) return "care";
  return "brand";
}

function inferVisualMotif(text: string, vertical?: string | null): string {
  const normalized = `${text} ${vertical ?? ""}`.toLowerCase();
  if (/vegetable|vegetables|gemuese|gemüse|legume|legumes|verdura|verdure/.test(normalized)) {
    return "fresh vegetable market spread";
  }
  if (/fruit|frucht|fruits|obst|frutta/.test(normalized)) return "bright seasonal fruit display";
  if (/coffee|kaffee|cafe|café|espresso/.test(normalized)) return "coffee cup and pastry table";
  if (/pizza|pasta|menu|dish|gericht|plate|restaurant/.test(normalized)) {
    return "signature dish on a styled table";
  }
  if (/fashion|mode|boutique|retail|shop|store|product/.test(normalized)) {
    return "curated product display";
  }
  if (/fitness|gym|training|yoga|movement/.test(normalized)) return "dynamic movement scene";
  if (/clinic|care|health|therapy|medical/.test(normalized)) return "calm care detail";
  if (/event|workshop|opening|festival|kurs/.test(normalized)) return "event poster atmosphere";
  return "branded local business scene";
}

function inferBackgroundStyle(
  template: ResolvedSocialCreativeTemplate,
  visualMotif: string,
): NonNullable<SocialCreativePlan["backgroundStyle"]> {
  if (template === "testimonial-proof") return "typographic";
  if (template === "carousel-cover") return "editorial";
  if (template === "product-hero" || template === "retail-offer") return "product-scene";
  if (/vegetable|fruit|coffee|dish|product/.test(visualMotif)) return "product-scene";
  if (template === "event-poster") return "typographic";
  if (template === "editorial-collage") return "editorial";
  return "pattern";
}

function firstSentence(text: string): string {
  const compact = clean(text).replace(/\s+/g, " ");
  const match = compact.match(/^(.{24,140}?[.!?])\s/);
  return clean(match?.[1] ?? compact.slice(0, 140));
}

function toTitleLine(text: string): string {
  return clean(text)
    .replace(/^[#\s]+/, "")
    .replace(/\s+/g, " ");
}

function clampWords(text: string, maxWords: number): string {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function clean(value?: string | null): string {
  return (value ?? "").trim();
}
