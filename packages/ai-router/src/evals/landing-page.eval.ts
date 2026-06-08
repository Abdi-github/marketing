// Eval suite for the landing-page AI workflow.
// Tests deterministic properties only (no network calls).
// See docs/AI_GUIDELINES.md §Evaluation.
//
// Scoring rubric:
//   PASS: output validates against schema, DE-CH section types present,
//         composition JSON parses, title is non-empty.
//   FAIL: schema validation error, missing required sections, empty title.
import { describe, it, expect } from "vitest";
import { EchoProvider } from "../providers/echo";
import { ProviderRouter } from "../router";
import { getPrompt } from "../prompts/registry";
import {
  landingPageCompositionSchema,
  landingPageSectionSchema,
  heroSectionSchema,
  gallerySectionSchema,
  testimonialsSectionSchema,
  faqSectionSchema,
  menuPreviewSectionSchema,
  offerSectionSchema,
  contactSectionSchema,
  type LandingPageComposition,
} from "../queues/landing-page.schema";

const baseOpts = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  jobId: "00000000-0000-0000-0000-000000000010",
  promptId: "landing-page-brief-v1",
  promptVersion: 1,
  costBudgetCents: 50,
};

const echo = new EchoProvider();
const router = new ProviderRouter({ trial: echo, primary: echo, fallback: echo });

const TENANT_PLAN = "trial";

// ─── Prompt rendering tests ───────────────────────────────────────────────────

describe("landing-page-brief-v1 prompt", () => {
  it("registers and has a system prompt", () => {
    const p = getPrompt("landing-page-brief-v1");
    expect(p.id).toBe("landing-page-brief-v1");
    expect(p.version).toBe(1);
    expect(p.systemPrompt.length).toBeGreaterThan(50);
  });

  it("buildUserPrompt includes businessName and userPrompt", () => {
    const p = getPrompt("landing-page-brief-v1");
    const out = p.buildUserPrompt({
      businessName: "Café Züri",
      vertical: "cafe",
      city: "Zürich",
      locale: "de-CH",
      userPrompt: "Zeig unsere saisonalen Kuchen und Kaffeespezialitäten",
    });
    expect(out).toContain("Café Züri");
    expect(out).toContain("saisonalen Kuchen");
  });
});

describe("landing-page-copy-v1 prompt", () => {
  it("registers correctly", () => {
    const p = getPrompt("landing-page-copy-v1");
    expect(p.id).toBe("landing-page-copy-v1");
    expect(p.systemPrompt).toContain("generate_sections");
  });

  it("buildUserPrompt includes brief and sections list", () => {
    const p = getPrompt("landing-page-copy-v1");
    const out = p.buildUserPrompt({
      brief: "Hauptbotschaft: Authentischer Kaffee in Zürich.",
      businessName: "Café Züri",
      vertical: "cafe",
      sections: "hero, about, contact, lead_form",
    });
    expect(out).toContain("hero");
    expect(out).toContain("Hauptbotschaft");
  });
});

describe("landing-page-layout-v1 prompt", () => {
  it("registers correctly", () => {
    const p = getPrompt("landing-page-layout-v1");
    expect(p.id).toBe("landing-page-layout-v1");
    expect(p.systemPrompt).toContain("compose_layout");
  });
});

// ─── Schema validation tests ──────────────────────────────────────────────────

describe("landingPageSectionSchema", () => {
  it("accepts a valid hero section", () => {
    const result = landingPageSectionSchema.safeParse({
      type: "hero",
      order: 0,
      heading: "Willkommen bei Café Züri",
      body: "Frischer Kaffee, hausgemachte Kuchen.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown section type", () => {
    const result = landingPageSectionSchema.safeParse({
      type: "unknown_type",
      order: 0,
      heading: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects section with empty heading", () => {
    const result = landingPageSectionSchema.safeParse({
      type: "about",
      order: 1,
      heading: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("landingPageCompositionSchema", () => {
  const validComposition: LandingPageComposition = {
    title: "Café Züri — Kaffee & Kuchen",
    locale: "de-CH",
    sections: [
      { type: "hero", order: 0, heading: "Willkommen", body: "Frischer Kaffee." },
      { type: "lead_form", order: 1, heading: "Kontakt" },
    ],
  };

  it("accepts a valid 2-section composition", () => {
    const result = landingPageCompositionSchema.safeParse(validComposition);
    expect(result.success).toBe(true);
  });

  it("rejects composition with fewer than 2 sections", () => {
    const result = landingPageCompositionSchema.safeParse({
      title: "Test",
      locale: "de-CH",
      sections: [{ type: "hero", order: 0, heading: "H" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects composition with more than 8 sections", () => {
    const result = landingPageCompositionSchema.safeParse({
      title: "Test",
      locale: "de-CH",
      sections: Array.from({ length: 9 }, (_, i) => ({
        type: "about" as const,
        order: i,
        heading: `Section ${i}`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("has a non-empty title", () => {
    const result = landingPageCompositionSchema.safeParse({ ...validComposition, title: "" });
    expect(result.success).toBe(false);
  });
});

// ─── EchoProvider tool-use path ───────────────────────────────────────────────

describe("EchoProvider — completionWithTools", () => {
  it("returns a toolResult with the tool name", async () => {
    const result = await echo.completionWithTools(
      { prompt: "Generate sections for a café" },
      [{ name: "generate_sections", description: "Generate sections", inputSchema: { type: "object" as const, properties: {} } }],
      baseOpts,
    );
    expect(result.toolResult).not.toBeNull();
    expect(result.toolResult?.["tool"]).toBe("generate_sections");
    expect(result.costUsd).toBe(0);
  });

  it("returns zero-cost embeddings", async () => {
    const result = await echo.embed(
      { texts: ["Café Züri", "Fitness Studio Bern"] },
      baseOpts,
    );
    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toHaveLength(1536);
    expect(result.costUsd).toBe(0);
  });
});

// ─── ProviderRouter tool-use path ─────────────────────────────────────────────

describe("ProviderRouter — routeWithTools", () => {
  it("routes through EchoProvider and writes usage", async () => {
    const usageRecords: unknown[] = [];
    const result = await router.routeWithTools(
      { prompt: "Test tool-use" },
      [{ name: "compose_layout", description: "Compose layout", inputSchema: { type: "object" as const, properties: {} } }],
      { ...baseOpts, promptId: "landing-page-layout-v1" },
      {
        tenantPlan: TENANT_PLAN,
        writeUsage: async (r) => { usageRecords.push(r); },
      },
    );
    expect(result.toolResult).toBeDefined();
    expect(usageRecords).toHaveLength(1);
  });
});

describe("ProviderRouter — routeEmbed", () => {
  it("routes through EchoProvider and writes usage", async () => {
    const usageRecords: unknown[] = [];
    const result = await router.routeEmbed(
      { texts: ["brand context text"] },
      { ...baseOpts, promptId: "embed-v1" },
      {
        tenantPlan: TENANT_PLAN,
        writeUsage: async (r) => { usageRecords.push(r); },
      },
    );
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(1536);
    expect(usageRecords).toHaveLength(1);
  });
});

// ─── DE-CH locale detection (deterministic check) ────────────────────────────

describe("landing-page composition — locale enforcement", () => {
  it("defaults locale to de-CH when omitted", () => {
    const result = landingPageCompositionSchema.safeParse({
      title: "Test Page",
      sections: [
        { type: "hero", order: 0, heading: "Willkommen" },
        { type: "about", order: 1, heading: "Über uns" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.locale).toBe("de-CH");
  });
});

// ─── Typed extras per section type (step-23) ─────────────────────────────────

describe("heroSectionSchema — typed extras", () => {
  it("accepts hero with CTA extras", () => {
    const result = heroSectionSchema.safeParse({
      type: "hero",
      order: 0,
      heading: "Willkommen bei Café Züri",
      body: "Frischer Kaffee täglich.",
      extras: { ctaText: "Jetzt reservieren", ctaHref: "#kontakt" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.ctaText).toBe("Jetzt reservieren");
  });

  it("accepts hero without extras (backwards compatibility)", () => {
    const result = heroSectionSchema.safeParse({
      type: "hero",
      order: 0,
      heading: "Willkommen",
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras).toBeUndefined();
  });
});

describe("testimonialsSectionSchema — typed extras", () => {
  it("accepts testimonials with items array", () => {
    const result = testimonialsSectionSchema.safeParse({
      type: "testimonials",
      order: 2,
      heading: "Was unsere Kunden sagen",
      extras: {
        items: [
          { quote: "Bestes Café Zürichs!", author: "Maria M.", role: "Zürich" },
          { quote: "Täglich hier.", author: "Peter K." },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.items).toHaveLength(2);
    expect(result.data?.extras?.items?.[0]?.quote).toBe("Bestes Café Zürichs!");
  });

  it("rejects testimonial item without required author", () => {
    const result = testimonialsSectionSchema.safeParse({
      type: "testimonials",
      order: 2,
      heading: "Testimonials",
      extras: { items: [{ quote: "Great!" }] },
    });
    expect(result.success).toBe(false);
  });
});

describe("faqSectionSchema — typed extras", () => {
  it("accepts FAQ items", () => {
    const result = faqSectionSchema.safeParse({
      type: "faq",
      order: 3,
      heading: "Häufige Fragen",
      extras: {
        items: [
          { question: "Wann öffnet ihr?", answer: "Täglich ab 8 Uhr." },
          { question: "Gibt es vegane Optionen?", answer: "Ja, täglich wechselnde Angebote." },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.items).toHaveLength(2);
  });
});

describe("menuPreviewSectionSchema — typed extras", () => {
  it("accepts menu items with price", () => {
    const result = menuPreviewSectionSchema.safeParse({
      type: "menu_preview",
      order: 1,
      heading: "Unsere Spezialitäten",
      extras: {
        items: [
          { name: "Zürcher Geschnetzeltes", price: "CHF 28", description: "Mit Rösti serviert." },
          { name: "Vegane Bowl", price: "CHF 22" },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.items?.[0]?.price).toBe("CHF 28");
  });
});

describe("offerSectionSchema — typed extras", () => {
  it("accepts offer with price and CTA", () => {
    const result = offerSectionSchema.safeParse({
      type: "offer",
      order: 2,
      heading: "Wochenend-Brunch",
      extras: {
        price: "CHF 29",
        oldPrice: "CHF 45",
        validUntil: "31. März",
        ctaText: "Jetzt buchen",
        ctaHref: "#buchung",
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.price).toBe("CHF 29");
    expect(result.data?.extras?.oldPrice).toBe("CHF 45");
  });
});

describe("gallerySectionSchema — typed extras", () => {
  it("accepts gallery with image array", () => {
    const result = gallerySectionSchema.safeParse({
      type: "gallery",
      order: 3,
      heading: "Impressionen",
      extras: {
        images: [
          { url: "https://example.com/img1.jpg", caption: "Innenraum" },
          { url: "https://example.com/img2.jpg" },
        ],
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.images).toHaveLength(2);
  });

  it("enforces max 12 images", () => {
    const result = gallerySectionSchema.safeParse({
      type: "gallery",
      order: 3,
      heading: "Gallery",
      extras: {
        images: Array.from({ length: 13 }, (_, i) => ({ url: `https://example.com/${i}.jpg` })),
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("contactSectionSchema — typed extras", () => {
  it("accepts contact details", () => {
    const result = contactSectionSchema.safeParse({
      type: "contact",
      order: 4,
      heading: "Kontakt",
      extras: {
        email: "info@cafezueri.ch",
        phone: "+41 44 123 45 67",
        address: "Bahnhofstrasse 1, 8001 Zürich",
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.extras?.email).toBe("info@cafezueri.ch");
  });
});

describe("discriminated union — full composition with all section types", () => {
  it("validates a rich 6-section composition with typed extras", () => {
    const result = landingPageCompositionSchema.safeParse({
      title: "Café Züri — Kaffee & Kuchen",
      locale: "de-CH",
      sections: [
        {
          type: "hero",
          order: 0,
          heading: "Herzlich willkommen",
          extras: { ctaText: "Reservieren", ctaHref: "#form" },
        },
        {
          type: "menu_preview",
          order: 1,
          heading: "Unsere Karte",
          extras: { items: [{ name: "Espresso", price: "CHF 4" }] },
        },
        {
          type: "testimonials",
          order: 2,
          heading: "Kundenstimmen",
          extras: { items: [{ quote: "Fantastisch!", author: "Anna B.", role: "Bern" }] },
        },
        {
          type: "faq",
          order: 3,
          heading: "FAQ",
          extras: { items: [{ question: "Habt ihr Parkplätze?", answer: "Ja, direkt daneben." }] },
        },
        {
          type: "contact",
          order: 4,
          heading: "Anfahrt & Kontakt",
          extras: { email: "info@cafezueri.ch", phone: "+41 44 123 45 67" },
        },
        { type: "lead_form", order: 5, heading: "Newsletter" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.sections).toHaveLength(6);
  });
});

// ─── Personalize prompts (LP-4 follow-up) ─────────────────────────────────────
// Registration + buildUserPrompt substring checks across all 4 locales.
// These always run on `pnpm test` — no network, no API key needed.

const PERSONALIZE_LOCALES: Array<{
  promptId: string;
  locale: string;
  city: string;
  vibePhrase: string;
  cliches: string[];
  /** A token that must appear in the system prompt so we know the locale wired correctly. */
  systemMarker: string;
}> = [
  { promptId: "landing-page-personalize-v1",    locale: "de-CH", city: "Zürich",  vibePhrase: "bold, modern, energetic", cliches: ["erstklassig", "weltklasse"], systemMarker: "Vibe-Übersetzung" },
  { promptId: "landing-page-personalize-en-v1", locale: "en",    city: "Geneva",  vibePhrase: "minimal, classic, calm",   cliches: ["world-class", "premium"],   systemMarker: "Vibe translation" },
  { promptId: "landing-page-personalize-fr-v1", locale: "fr-CH", city: "Genève",  vibePhrase: "modern, energetic",       cliches: ["incontournable"],            systemMarker: "Traduction de vibe" },
  { promptId: "landing-page-personalize-it-v1", locale: "it-CH", city: "Lugano",  vibePhrase: "elegant, calm",           cliches: ["imperdibile"],               systemMarker: "Traduzione vibe" },
];

describe.each(PERSONALIZE_LOCALES)(
  "$promptId",
  ({ promptId, locale, city, vibePhrase, systemMarker }) => {
    it("registers correctly", () => {
      const p = getPrompt(promptId);
      expect(p.id).toBe(promptId);
      expect(p.version).toBe(1);
      expect(p.systemPrompt.length).toBeGreaterThan(200);
    });

    it("system prompt declares vibe + goal translation rules", () => {
      const p = getPrompt(promptId);
      expect(p.systemPrompt).toContain(systemMarker);
      // Every locale's system prompt must mention all 5 goals so the AI
      // can map wizard goal → CTA style. Regression guard: if someone
      // strips the goal table during a future edit, this fails loudly.
      expect(p.systemPrompt).toContain("lead_capture");
      expect(p.systemPrompt).toContain("sales_promo");
      expect(p.systemPrompt).toContain("event_signup");
      expect(p.systemPrompt).toContain("appointment_booking");
      expect(p.systemPrompt).toContain("info_brochure");
    });

    it("system prompt enforces generate_sections tool usage", () => {
      const p = getPrompt(promptId);
      expect(p.systemPrompt).toContain("generate_sections");
    });

    it("buildUserPrompt threads through brief, businessName, city, sections, brandHints", () => {
      const p = getPrompt(promptId);
      const out = p.buildUserPrompt({
        brief: `Marketing brief for ${city}`,
        businessName: "Acme Café",
        vertical: "cafe",
        city,
        sections: "hero, about, contact, lead_form",
        brandHints: `Vibe: ${vibePhrase}. Primary goal: lead capture. Palette: warm-roasted.`,
      });
      expect(out).toContain("Acme Café");
      expect(out).toContain(city);
      expect(out).toContain("hero");
      expect(out).toContain("contact");
      expect(out).toContain(vibePhrase);
      // brandHints must appear under a locale-appropriate label, never raw.
      expect(out.includes("Brand vibe") || out.includes("Brand-Vibe") || out.includes("Vibe de marque") || out.includes("Vibe del brand")).toBe(true);
    });

    it("buildUserPrompt omits brandHints label cleanly when no hints provided", () => {
      const p = getPrompt(promptId);
      const out = p.buildUserPrompt({
        brief: "Plain brief",
        businessName: "No-Hints Co",
        vertical: "service",
        city: "Bern",
        sections: "hero, lead_form",
      });
      // No empty "Vibe: " line — the optional hint section must drop entirely.
      expect(out).not.toMatch(/(Brand vibe|Brand-Vibe|Vibe de marque|Vibe del brand)\s*:\s*$/m);
    });

    void locale; // referenced for future locale-specific assertions
  },
);

describe("personalize prompts — Swiss locale fidelity (lint-style)", () => {
  it("de-CH system prompt avoids ß (uses ss for Swiss)", () => {
    const p = getPrompt("landing-page-personalize-v1");
    // The system prompt itself is the regression target — if a curator
    // accidentally pastes a German-German "ß" into the de-CH prompt, this
    // fails so we catch it before users see Swiss-incorrect output.
    expect(p.systemPrompt).not.toMatch(/ß/);
  });

  it("fr-CH system prompt prefers Swiss French conventions over France French", () => {
    const p = getPrompt("landing-page-personalize-fr-v1");
    // Soft check — the prompt should reference Swiss romande, not generic French.
    expect(p.systemPrompt.toLowerCase()).toContain("suisse");
  });

  it("it-CH system prompt references Ticino, not generic Italian", () => {
    const p = getPrompt("landing-page-personalize-it-v1");
    expect(p.systemPrompt.toLowerCase()).toContain("ticino");
  });
});

// ─── Haiku-as-judge fixture suite (opt-in) ────────────────────────────────────
// Runs the real personalize prompt against Sonnet, then has Haiku score the
// output on vibe match, locale fidelity, and cliché avoidance.
//
// Gated behind RUN_LLM_EVALS=1 because each fixture costs ~$0.05 (~$0.001
// for Haiku judge + ~$0.04 for Sonnet generation). CI runs this nightly,
// not on every PR.
//
// Cost per full run: ~$0.20 (4 fixtures × ~$0.05).
// Run with: RUN_LLM_EVALS=1 pnpm --filter @marketing/ai-router test

type PersonalizeFixture = {
  name: string;
  promptId: string;
  locale: "de-CH" | "fr-CH" | "it-CH" | "en";
  input: {
    brief: string;
    businessName: string;
    vertical: string;
    city: string;
    sections: string;
    brandHints: string;
  };
  expectedVibe: string;
  forbiddenSubstrings: string[];
  /** What "good output" looks like in plain English, for the Haiku judge. */
  judgeRubric: string;
};

const PERSONALIZE_FIXTURES: PersonalizeFixture[] = [
  {
    name: "energetic-bold-cafe-DE",
    promptId: "landing-page-personalize-v1",
    locale: "de-CH",
    input: {
      brief: "Spezialitätenkaffee in Zürich mit Sonntags-Brunch. Wir wollen neue Stammgäste gewinnen.",
      businessName: "Café Bern",
      vertical: "cafe",
      city: "Zürich",
      sections: "hero, about, menu_preview, lead_form",
      brandHints: "Vibe: bold, modern, energetic. Primary goal: lead_capture. Palette: sport-orange.",
    },
    expectedVibe: "bold, modern, energetic — punchy short headlines, action verbs, energy in every sentence",
    forbiddenSubstrings: ["ß", "weltklasse", "erstklassig", "unvergesslich"],
    judgeRubric: "The copy should feel BOLD and ENERGETIC. Headlines should be short and punchy. Body should use action verbs. It should match Swiss-German conventions (no 'ß', use 'ss'). It should avoid marketing clichés like 'weltklasse', 'erstklassig', 'unvergesslich'. Locale: de-CH.",
  },
  {
    name: "minimal-classic-clinic-EN",
    promptId: "landing-page-personalize-en-v1",
    locale: "en",
    input: {
      brief: "Family dental clinic in Geneva offering preventive and aesthetic care. We want to attract new patients.",
      businessName: "Geneva Dental Care",
      vertical: "clinic",
      city: "Geneva",
      sections: "hero, about, contact, lead_form",
      brandHints: "Vibe: minimal, classic, calm. Primary goal: appointment_booking. Palette: alpine-clean.",
    },
    expectedVibe: "minimal, classic, calm — concise, trust-building, no exclamation marks",
    forbiddenSubstrings: ["world-class", "premium", "exceptional", "best-in-class"],
    judgeRubric: "The copy should feel MINIMAL and CALM. Short sentences. Trust-building tone for a medical clinic. Avoid marketing clichés like 'world-class', 'premium', 'exceptional'. Should mention appointment booking subtly, not aggressively. Locale: English (international, no Britishisms or Americanisms).",
  },
  {
    name: "modern-energetic-fitness-FR",
    promptId: "landing-page-personalize-fr-v1",
    locale: "fr-CH",
    input: {
      brief: "Studio de fitness boutique à Lausanne, coaching personnalisé et petits groupes. Inscriptions ouvertes.",
      businessName: "Studio Forme",
      vertical: "fitness",
      city: "Lausanne",
      sections: "hero, offer, testimonials, lead_form",
      brandHints: "Vibe: bold, modern, energetic. Primary goal: lead_capture. Palette: sport-orange.",
    },
    expectedVibe: "modern, energetic — French romand tone, vouvoiement, action-driving CTAs",
    forbiddenSubstrings: ["incontournable", "unique en son genre", "exceptionnel"],
    judgeRubric: "The copy should feel ENERGETIC and MODERN. Use Swiss French (Suisse romande) conventions, vouvoiement (vous-form). Action-driving verbs. Avoid marketing clichés like 'incontournable', 'unique en son genre'. Locale: fr-CH.",
  },
  {
    name: "elegant-calm-restaurant-IT",
    promptId: "landing-page-personalize-it-v1",
    locale: "it-CH",
    input: {
      brief: "Ristorante di alta cucina a Lugano, menù degustazione stagionale. Cerchiamo prenotazioni per la cena.",
      businessName: "Osteria del Lago",
      vertical: "restaurant",
      city: "Lugano",
      sections: "hero, menu_preview, gallery, contact, lead_form",
      brandHints: "Vibe: classic, elegant, calm. Primary goal: appointment_booking. Palette: geneve-elegance.",
    },
    expectedVibe: "elegant, calm — Ticino-Italian register, formal Lei, refined vocabulary",
    forbiddenSubstrings: ["imperdibile", "esperienza unica", "eccezionale"],
    judgeRubric: "The copy should feel ELEGANT and CALM. Use Swiss Italian (Ticino) register, formal Lei address. Refined vocabulary. Avoid marketing clichés like 'imperdibile', 'esperienza unica'. Locale: it-CH.",
  },
];

const RUN_LLM_EVALS = process.env["RUN_LLM_EVALS"] === "1";

describe.runIf(RUN_LLM_EVALS)("personalize prompts — Haiku-as-judge quality eval", () => {
  // Lazy imports — only loaded when actually running, so missing env vars
  // don't break the deterministic eval pass.
  it("each fixture passes both deterministic guards and the Haiku judge", async () => {
    const { createAnthropicSonnet, createAnthropicHaiku } = await import("../providers/anthropic");
    const sonnet = createAnthropicSonnet();
    const haiku = createAnthropicHaiku();

    const generateTool = {
      name: "generate_sections",
      description: "Return the personalized copy",
      inputSchema: {
        type: "object" as const,
        properties: {
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                heading: { type: "string" },
                body: { type: "string" },
              },
            },
          },
        },
      },
    };

    const judgeTool = {
      name: "judge_copy",
      description: "Score the copy",
      inputSchema: {
        type: "object" as const,
        properties: {
          vibeMatch:        { type: "integer", minimum: 0, maximum: 5 },
          localeFidelity:   { type: "integer", minimum: 0, maximum: 5 },
          clicheAvoidance:  { type: "integer", minimum: 0, maximum: 5 },
          reasoning:        { type: "string", maxLength: 400 },
        },
        required: ["vibeMatch", "localeFidelity", "clicheAvoidance", "reasoning"],
      },
    };

    const failures: string[] = [];

    for (const fx of PERSONALIZE_FIXTURES) {
      const prompt = getPrompt(fx.promptId);
      const userPrompt = prompt.buildUserPrompt(fx.input);

      const gen = await sonnet.completionWithTools(
        { prompt: userPrompt, systemPrompt: prompt.systemPrompt, maxTokens: 1200, temperature: 0.4 },
        [generateTool],
        { tenantId: baseOpts.tenantId, jobId: `${baseOpts.jobId}-${fx.name}`, promptId: fx.promptId, promptVersion: 1, costBudgetCents: 25 },
      );

      const sectionsArr = (gen.toolResult as { sections?: Array<{ heading: string; body: string }> } | null)?.sections ?? [];
      const flatText = sectionsArr.map((s) => `${s.heading}\n${s.body}`).join("\n\n");

      // Deterministic guards — substring blacklist (cliché lint).
      for (const forbidden of fx.forbiddenSubstrings) {
        if (flatText.includes(forbidden)) {
          failures.push(`[${fx.name}] forbidden substring "${forbidden}" appeared in output`);
        }
      }
      if (flatText.length < 100) {
        failures.push(`[${fx.name}] output too short (${flatText.length} chars) — likely truncated`);
      }

      // Haiku judges the qualitative properties.
      const judgement = await haiku.completionWithTools(
        {
          prompt: `Generated copy:\n\n${flatText}\n\nRubric:\n${fx.judgeRubric}\n\nScore 0-5 per axis and explain in one sentence per axis.`,
          systemPrompt: "You are a strict copy editor scoring landing-page copy on three axes. Use the judge_copy tool with integer 0-5 scores.",
          maxTokens: 400,
          temperature: 0,
        },
        [judgeTool],
        { tenantId: baseOpts.tenantId, jobId: `${baseOpts.jobId}-judge-${fx.name}`, promptId: "haiku-judge", promptVersion: 1, costBudgetCents: 5 },
      );

      const j = judgement.toolResult as { vibeMatch?: number; localeFidelity?: number; clicheAvoidance?: number; reasoning?: string } | null;
      if (!j) {
        failures.push(`[${fx.name}] judge returned no scores`);
        continue;
      }
      // 3/5 is the passing bar — a Haiku judge is conservative; 3 means
      // "acceptable" and reflects honest variance in AI output.
      if ((j.vibeMatch ?? 0) < 3)       failures.push(`[${fx.name}] vibeMatch ${j.vibeMatch}/5 — ${j.reasoning}`);
      if ((j.localeFidelity ?? 0) < 3)  failures.push(`[${fx.name}] localeFidelity ${j.localeFidelity}/5 — ${j.reasoning}`);
      if ((j.clicheAvoidance ?? 0) < 3) failures.push(`[${fx.name}] clicheAvoidance ${j.clicheAvoidance}/5 — ${j.reasoning}`);
    }

    expect(failures, `Personalize prompt quality regressions:\n  ${failures.join("\n  ")}`).toEqual([]);
  }, 120_000); // 2-minute total budget — 4 fixtures × ~15s each
});
