// Unit test for the landing-page worker handler.
// All external deps (DB, BullMQ, Redis, ProviderRouter) are mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("bullmq", () => {
  // Defined inside the factory so it is available when the module is resolved.
  // instanceof checks in the worker pass because both sides use this same class.
  class UnrecoverableError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "UnrecoverableError";
    }
  }
  return {
    Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
    Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn() })),
    UnrecoverableError,
  };
});

// Mutable Redis state — read inside the mock closure (captured by reference).
let _redisPlan: string | null = "trial";
let _redisBudget: string | null = "0";

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    ping: vi.fn(),
    on: vi.fn(),
    get: vi.fn().mockImplementation(async (key: string) => {
      if (key.startsWith("tenant:plan:")) return _redisPlan;
      if (key.startsWith("budget:monthly:")) return _redisBudget;
      return null;
    }),
    set: vi.fn().mockResolvedValue("OK"),
    pipeline: vi.fn().mockReturnValue({
      incrbyfloat: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  })),
}));

const mockRoute = vi.fn().mockResolvedValue({
  text: "Das ist ein gutes Café in Zürich.",
  inputTokens: 100,
  outputTokens: 80,
  costUsd: 0.0003,
  model: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  latencyMs: 500,
});

const mockRouteWithTools = vi.fn().mockResolvedValue({
  toolResult: {
    title: "Café Züri",
    sections: [
      { type: "hero", order: 0, heading: "Willkommen", body: "Frischer Kaffee." },
      { type: "lead_form", order: 1, heading: "Kontakt" },
    ],
  },
  inputTokens: 200,
  outputTokens: 150,
  costUsd: 0.0006,
  model: "claude-sonnet-4-6",
  provider: "anthropic",
  latencyMs: 800,
});

const { mockBuildUserPrompt } = vi.hoisted(() => ({
  mockBuildUserPrompt: vi.fn().mockReturnValue("Erstelle eine Landing Page für Café Züri"),
}));

vi.mock("@marketing/ai-router", () => ({
  ProviderRouter: vi.fn().mockImplementation(() => ({
    route: mockRoute,
    routeWithTools: mockRouteWithTools,
    routeEmbed: vi.fn().mockResolvedValue({ embeddings: [], costUsd: 0 }),
  })),
  EchoProvider: vi.fn().mockImplementation(() => ({
    id: "echo",
    model: "echo-1",
    complete: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
  })),
  createAnthropicSonnet: vi
    .fn()
    .mockReturnValue({ id: "anthropic:sonnet", isHealthy: vi.fn().mockResolvedValue(true) }),
  createAnthropicHaiku: vi
    .fn()
    .mockReturnValue({ id: "anthropic:haiku", isHealthy: vi.fn().mockResolvedValue(true) }),
  createOpenAIMini: vi
    .fn()
    .mockReturnValue({ id: "openai:mini", isHealthy: vi.fn().mockResolvedValue(true) }),
  getPrompt: vi.fn().mockReturnValue({
    id: "landing-page-brief-v1",
    version: 1,
    systemPrompt: "Du bist Landing-Page-Experte…",
    buildUserPrompt: mockBuildUserPrompt,
  }),
  createLandingPageDesignPlan: vi.fn().mockReturnValue({
    subvertical: "agency-digital",
    archetype: "bold-agency",
    conversionGoal: "lead_capture",
    sectionTopology: "conversion-first",
    heroTreatment: "gradient-spotlight",
    navStyle: "bold-pill",
    motionStyle: "soft-reveal",
    density: "balanced",
    imageDirection: "portfolio-proof",
    styleContract: {
      era: "modern",
      navStyle: "bold-pill",
      heroVariants: ["agency-bento"],
      sectionOrder: ["hero", "offer", "lead_form"],
      variantPools: {},
      palettePool: [],
      fontPairPool: [],
      rhythmStyle: "balanced-contrast",
      spacing: "balanced",
      motionStyle: "soft-reveal",
    },
    uniquenessSeed: "seed",
    uniquenessFingerprint: "fingerprint",
  }),
  designPlanSeed: vi.fn().mockReturnValue("seed"),
  landingPageJobSchema: { parse: (d: unknown) => d },
  landingPageCompositionSchema: {
    safeParse: (d: unknown) => ({ success: true, data: d }),
  },
  LANDING_PAGE_QUEUE_NAME: "ai.landing_page.compose",
  SOCIAL_POST_QUEUE_NAME: "ai.social_post.generate",
  findRelevantContext: vi.fn().mockResolvedValue([]),
}));

vi.mock("@marketing/billing", () => ({
  getPlanCaps: vi.fn().mockReturnValue({ perJobBudgetCents: 50, monthlyAiBudgetUsd: 10 }),
  monthlyBudgetKey: vi.fn().mockImplementation((id: string) => `budget:monthly:${id}`),
  BUDGET_KEY_TTL_SECONDS: 86400,
}));

vi.mock("@marketing/shared", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    ANTHROPIC_API_KEY: "sk-ant-test",
    DATABASE_URL: "postgres://localhost/test",
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    BETTER_AUTH_SECRET: "test",
    BETTER_AUTH_URL: "http://localhost:3000",
    OTEL_SERVICE_NAME: "test",
    AI_PROVIDER_FALLBACK: "echo",
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordMetric: vi.fn(),
  hashId: vi.fn().mockImplementation((value: string) => `hash:${value}`),
}));

// Mutable DB state.
let _landingPage: Record<string, unknown> = {};

vi.mock("@marketing/db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockImplementation(async () => (Object.keys(_landingPage).length ? [_landingPage] : [])),
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => {
        const p = Promise.resolve([{ id: "mock-id-001" }]) as Promise<{ id: string }[]> & {
          onConflictDoNothing: ReturnType<typeof vi.fn>;
          returning: ReturnType<typeof vi.fn>;
        };
        (p as unknown as Record<string, unknown>).onConflictDoNothing = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "mock-id-001" }]),
        });
        (p as unknown as Record<string, unknown>).returning = vi
          .fn()
          .mockResolvedValue([{ id: "mock-id-001" }]);
        return p;
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  aiUsage: { jobId: {}, id: {}, tenantId: {}, createdAt: {} },
  landingPages: { id: {}, tenantId: {}, stepData: {}, status: {} },
  landingPageVersions: { id: {}, tenantId: {}, landingPageId: {} },
  brandEmbeddings: { tenantId: {}, contentHash: {} },
  tenants: { id: {}, plan: {} },
  outbox: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue({}),
  and: vi.fn().mockReturnValue({}),
  sql: vi.fn().mockReturnValue({}),
  desc: vi.fn().mockReturnValue({}),
}));

// ─── Import handler after mocks ───────────────────────────────────────────────

import {
  enrichConversionSections,
  handleLandingPageJob,
  setRouterForTest,
} from "../queues/landing-page/worker";
import { ProviderRouter } from "@marketing/ai-router";
import type { LandingPageComposition, LandingPageDesignPlan } from "@marketing/ai-router";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const PAGE_ID = "00000000-0000-0000-0000-000000000099";

const BASE_DATA = {
  tenantId: TENANT_ID,
  landingPageId: PAGE_ID,
  userId: "00000000-0000-0000-0000-000000000003",
  businessName: "Café Züri",
  vertical: "cafe",
  city: "Zürich",
  locale: "de-CH",
  userPrompt: "Zeig unsere saisonalen Kuchen und Kaffeespezialitäten",
  idempotencyKey: "00000000-0000-0000-0000-000000000010",
  promptId: "landing-page-brief-v1",
  promptVersion: 1,
  costBudgetCents: 50,
  step: "brief" as "brief" | "copy" | "layout" | "publish",
};

function makeJob(data = BASE_DATA) {
  return { id: data.idempotencyKey, data } as Parameters<typeof handleLandingPageJob>[0];
}

function injectMockRouter(): void {
  const r = new (ProviderRouter as unknown as new (...a: unknown[]) => {
    route: typeof mockRoute;
    routeWithTools: typeof mockRouteWithTools;
  })();
  setRouterForTest(r as unknown as ProviderRouter);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleLandingPageJob — unit", () => {
  beforeEach(() => {
    _redisPlan = "trial";
    _redisBudget = "0";
    _landingPage = {
      id: PAGE_ID,
      tenantId: TENANT_ID,
      slug: "test-cafe-page",
      title: "Café Züri",
      status: "draft",
      currentVersionId: null,
      stepData: {},
    };
    mockRoute.mockClear();
    mockRouteWithTools.mockClear();
    mockBuildUserPrompt.mockClear();
    injectMockRouter();
  });

  it("brief step: calls route once when stepData.brief is absent", async () => {
    await handleLandingPageJob(makeJob());
    expect(mockRoute).toHaveBeenCalledOnce();
    expect(mockRouteWithTools).not.toHaveBeenCalled();
  });

  it("brief step: skips AI call when stepData.brief is already present (idempotency)", async () => {
    _landingPage = {
      ..._landingPage,
      stepData: { brief: { text: "Bestehende Zusammenfassung.", aiUsageId: "usage-001" } },
    };
    await handleLandingPageJob(makeJob());
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("copy step: calls routeWithTools once", async () => {
    _landingPage = {
      ..._landingPage,
      stepData: { brief: { text: "Kurze Beschreibung des Cafés.", aiUsageId: "usage-001" } },
    };
    await handleLandingPageJob(makeJob({ ...BASE_DATA, step: "copy" }));
    expect(mockRouteWithTools).toHaveBeenCalledOnce();
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("copy step: includes design-plan intent in wizard brand hints", async () => {
    _landingPage = {
      ..._landingPage,
      stepData: {
        brief: { text: "Modern agency brief.", aiUsageId: "usage-001" },
        wizardPayload: {
          goal: "lead_capture",
          paletteKey: "sky-startup",
          siteMode: "website",
          vibe: { minimalBold: 0.7, classicModern: 0.8, calmEnergetic: 0.2 },
        },
      },
    };

    await handleLandingPageJob(
      makeJob({
        ...BASE_DATA,
        step: "copy",
        businessName: "Studio Nord",
        vertical: "service",
        userPrompt: "Modern web design agency for Swiss SMEs.",
      }),
    );

    expect(mockBuildUserPrompt).toHaveBeenCalledOnce();
    expect(mockBuildUserPrompt.mock.calls[0]?.[0]).toMatchObject({
      brandHints: expect.stringContaining("Design plan: agency-digital"),
    });
    expect(mockBuildUserPrompt.mock.calls[0]?.[0].brandHints).toContain(
      "image direction portfolio-proof",
    );
  });

  it("publish step: inserts version row without calling route or routeWithTools", async () => {
    _landingPage = {
      ..._landingPage,
      status: "draft",
      currentVersionId: null,
      stepData: {
        brief: { text: "brief text", aiUsageId: "u1" },
        copy: { sections: [], aiUsageId: "u2" },
        layout: {
          composition: {
            title: "Café Züri",
            locale: "de-CH",
            sections: [
              { type: "hero", order: 0, heading: "Willkommen" },
              { type: "lead_form", order: 1, heading: "Kontakt" },
            ],
          },
          aiUsageId: "u3",
        },
      },
    };
    await handleLandingPageJob(makeJob({ ...BASE_DATA, step: "publish" }));
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockRouteWithTools).not.toHaveBeenCalled();
  });

  it("monthly budget exceeded: throws UnrecoverableError without calling route", async () => {
    _redisBudget = "99.0"; // 99 USD >> 10 USD cap
    await expect(handleLandingPageJob(makeJob())).rejects.toThrow("Monthly AI budget exceeded");
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("re-throws provider errors so BullMQ can retry", async () => {
    mockRoute.mockRejectedValueOnce(new Error("anthropic timeout"));
    await expect(handleLandingPageJob(makeJob())).rejects.toThrow("anthropic timeout");
  });
});

describe("enrichConversionSections", () => {
  const basePlan: LandingPageDesignPlan = {
    subvertical: "agency-digital",
    archetype: "bold-agency",
    conversionGoal: "lead_capture",
    sectionTopology: "conversion-first",
    heroTreatment: "gradient-spotlight",
    navStyle: "bold-pill",
    motionStyle: "soft-reveal",
    density: "balanced",
    imageDirection: "portfolio-proof",
    styleContract: {
      era: "modern",
      navStyle: "bold-pill",
      heroVariants: ["agency-bento"],
      sectionOrder: ["hero", "offer", "lead_form"],
      variantPools: {},
      palettePool: [],
      fontPairPool: [],
      rhythmStyle: "balanced-contrast",
      spacing: "balanced",
      motionStyle: "soft-reveal",
    },
    uniquenessSeed: "seed",
    uniquenessFingerprint: "fingerprint",
  };

  function composition(locale = "en"): LandingPageComposition {
    return {
      title: "Test Page",
      locale,
      sections: [
        { type: "hero", order: 0, heading: "Hero" },
        {
          type: "offer",
          order: 1,
          heading: "Start here",
          body: "Generic offer copy.",
          extras: { ctaText: "Request quote" },
        },
        { type: "lead_form", order: 2, heading: "Get in touch" },
      ],
      site: {
        mode: "website",
        pages: [
          {
            slug: "contact",
            title: "Contact",
            sections: [
              { type: "offer", order: 0, heading: "Generic", body: "Generic" },
              { type: "lead_form", order: 1, heading: "Contact" },
            ],
          },
        ],
      },
    };
  }

  it("tailors offer and lead-form copy for agency lead-capture pages", () => {
    const enriched = enrichConversionSections(composition("en"), basePlan);
    const offer = enriched.sections.find((section) => section.type === "offer");
    const leadForm = enriched.sections.find((section) => section.type === "lead_form");

    expect(offer?.heading).toContain("qualified leads");
    expect(offer?.body).toContain("right visitors");
    expect(offer?.extras).toMatchObject({ ctaText: "Request quote", ctaHref: "#lp-lead-form" });
    expect(leadForm?.heading).toBe("Start with a short project brief");
  });

  it("uses localized clinic copy and enriches website subpage sections", () => {
    const plan: LandingPageDesignPlan = { ...basePlan, subvertical: "clinic-trust" };
    const enriched = enrichConversionSections(composition("de-CH"), plan);
    const offer = enriched.sections.find((section) => section.type === "offer");
    const subpageOffer = enriched.site?.pages?.[0]?.sections.find(
      (section) => section.type === "offer",
    );

    expect(offer?.heading).toContain("Konsultation");
    expect(offer?.body).toContain("Anliegen");
    expect(subpageOffer?.heading).toBe(offer?.heading);
  });

  it("keeps generated copy for unknown future subverticals", () => {
    const plan: LandingPageDesignPlan = { ...basePlan, subvertical: "future-specialist" };
    const enriched = enrichConversionSections(composition("en"), plan);
    const offer = enriched.sections.find((section) => section.type === "offer");
    const leadForm = enriched.sections.find((section) => section.type === "lead_form");

    expect(offer?.heading).toBe("Start here");
    expect(offer?.body).toBe("Generic offer copy.");
    expect(offer?.extras).toMatchObject({ ctaText: "Request quote" });
    expect(leadForm?.heading).toBe("Get in touch");
  });
});
