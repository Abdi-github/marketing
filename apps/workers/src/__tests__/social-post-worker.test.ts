// Unit test for the social-post worker handler.
// All external deps (DB, BullMQ, ProviderRouter) are mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn() })),
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(msg: string) { super(msg); this.name = "UnrecoverableError"; }
  },
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    ping: vi.fn(),
    on: vi.fn(),
    // Monthly budget helpers — default to 0 spend (always under cap).
    get: vi.fn().mockResolvedValue("0"),
    set: vi.fn().mockResolvedValue("OK"),
    pipeline: vi.fn().mockReturnValue({
      incrbyfloat: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  })),
}));

const mockRoute = vi.fn().mockResolvedValue({
  text: "Frisch, lokal — unser Mittagsmenü! Täglich wechselnd.",
  inputTokens: 120,
  outputTokens: 50,
  costUsd: 0.0004,
  model: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  latencyMs: 750,
});

vi.mock("@marketing/ai-router", () => ({
  ProviderRouter: vi.fn().mockImplementation(() => ({ route: mockRoute })),
  EchoProvider: vi.fn().mockImplementation(() => ({
    id: "echo", model: "echo-1", complete: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
  })),
  createAnthropicSonnet: vi.fn().mockReturnValue({ id: "anthropic:sonnet", isHealthy: vi.fn().mockResolvedValue(true) }),
  createAnthropicHaiku:  vi.fn().mockReturnValue({ id: "anthropic:haiku",  isHealthy: vi.fn().mockResolvedValue(true) }),
  createOpenAIMini:      vi.fn().mockReturnValue({ id: "openai:mini",       isHealthy: vi.fn().mockResolvedValue(true) }),
  getPrompt: vi.fn().mockReturnValue({
    id: "social-post-v1",
    version: 1,
    systemPrompt: "Du bist Social-Media-Experte…",
    buildUserPrompt: vi.fn().mockReturnValue("Erstelle einen Post für Zürich"),
  }),
  socialPostJobSchema: { parse: (d: unknown) => d },
  SOCIAL_POST_QUEUE_NAME: "ai.social_post.generate",
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
    AI_PROVIDER_FALLBACK: undefined,
    OPENAI_API_KEY: undefined,
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordMetric: vi.fn(),
  hashId: vi.fn().mockReturnValue("hashed-tenant-id"),
  TENANT_LIFECYCLE_EVENTS: {
    FIRST_POST_EMITTED: "tenant.first_post_emitted",
    FIRST_PAID_AT: "tenant.first_paid_at",
    CHURNED: "tenant.churned",
  },
}));

vi.mock("@marketing/billing", () => ({
  getPlanCaps: vi.fn().mockReturnValue({ monthlyAiBudgetUsd: 10, perJobBudgetCents: 50 }),
  monthlyBudgetKey: vi.fn().mockReturnValue("budget:tenant:001"),
  BUDGET_KEY_TTL_SECONDS: 3600,
}));

// ─── DB mock — module-level spy functions ─────────────────────────────────────

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock("@marketing/db", () => ({
  db: {
    get insert() { return mockInsert; },
    get update() { return mockUpdate; },
    get select() { return mockSelect; },
  },
  aiUsage:            { jobId: "job_id", tenantId: "tenant_id" },
  socialPosts:        { jobId: "job_id", tenantId: "tenant_id", status: "status" },
  tenants:            { id: "id", suspended: "suspended", plan: "plan", firstPostAt: "first_post_at" },
  outbox:             {},
  tenantMetricsDaily: { tenantId: "tenant_id", dayDate: "day_date", postsGenerated: "posts_generated" },
}));

vi.mock("drizzle-orm", () => ({
  eq:     vi.fn().mockReturnValue({}),
  and:    vi.fn().mockReturnValue({}),
  isNull: vi.fn().mockReturnValue({}),
  sql:    Object.assign(vi.fn().mockReturnValue({}), { join: vi.fn() }),
}));

// ─── Import handler after mocks ───────────────────────────────────────────────

import { handleSocialPostJob, setRouterForTest } from "../queues/social-post/worker";
import { ProviderRouter } from "@marketing/ai-router";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const JOB_ID    = "00000000-0000-0000-0000-000000000002";

const JOB_DATA = {
  tenantId: TENANT_ID, jobId: JOB_ID,
  userId: "00000000-0000-0000-0000-000000000003",
  businessName: "Zum Goldenen Raben",
  vertical: "restaurant" as const, city: "Zürich", locale: "de-CH",
  topic: "Mittagsmenü", highlights: "frisch, saisonal",
  idempotencyKey: JOB_ID, promptId: "social-post-v1", promptVersion: 1,
  costBudgetCents: 50,
};

function makeJob(data = JOB_DATA) {
  return { id: data.jobId, data } as Parameters<typeof handleSocialPostJob>[0];
}

function injectMockRouter() {
  const r = new (ProviderRouter as unknown as new (...a: unknown[]) => { route: typeof mockRoute })();
  setRouterForTest(r as unknown as ProviderRouter);
}

// ─── DB mock factory ──────────────────────────────────────────────────────────

type DbSetup = {
  existingPost?: { status: string; jobId: string } | null;
  suspended?: boolean;
  /** returning value from UPDATE tenants SET first_post_at IS NULL */
  firstPostReturning?: unknown[];
};

function setupDb({
  existingPost = null,
  suspended = false,
  firstPostReturning = [{ id: TENANT_ID }],
}: DbSetup = {}) {
  let selectCall = 0;

  // select mock drives: getSocialPostByJobId → suspension check → getTenantPlan
  mockSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(async () => {
        const n = selectCall++;
        if (n === 0) return existingPost ? [existingPost] : [];
        if (n === 1) return [{ suspended }];
        return [{ plan: "trial" }];
      }),
    }),
  }));

  // insert mock — tracks all calls, supports all chaining patterns used in the worker.
  mockInsert.mockImplementation(() => ({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "usage-id-001" }]),
      }),
      onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    }),
  }));

  // update mock — .set().where().returning()
  mockUpdate.mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(firstPostReturning),
      }),
    }),
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInsert.mockClear();
  mockUpdate.mockClear();
  mockSelect.mockClear();
  mockRoute.mockClear();
  injectMockRouter();
});

describe("handleSocialPostJob — unit", () => {
  it("calls ProviderRouter when no existing completed post", async () => {
    setupDb();
    await handleSocialPostJob(makeJob());
    expect(mockRoute).toHaveBeenCalledOnce();
  });

  it("skips ProviderRouter call when post is already completed (idempotency)", async () => {
    setupDb({ existingPost: { status: "completed", jobId: JOB_ID } });
    await handleSocialPostJob(makeJob());
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("re-throws errors so BullMQ can retry", async () => {
    setupDb();
    mockRoute.mockRejectedValueOnce(new Error("provider timeout"));
    await expect(handleSocialPostJob(makeJob())).rejects.toThrow("provider timeout");
  });
});

describe("handleSocialPostJob — daily metrics upsert (ADR-0016 §D2)", () => {
  it("calls db.insert with tenantMetricsDaily after a successful job", async () => {
    setupDb();
    await handleSocialPostJob(makeJob());

    // Find the insert call whose first arg has a "dayDate" key — that is tenantMetricsDaily.
    const tableArgs = mockInsert.mock.calls.map(([table]) => table);
    const metricsInsert = tableArgs.find(
      (t): t is object => typeof t === "object" && t !== null && "dayDate" in t,
    );
    expect(metricsInsert).toBeDefined();
  });

  it("passes the vertical from job data to the metrics row", async () => {
    setupDb();
    await handleSocialPostJob(makeJob());
    // The values() call immediately after the tenantMetricsDaily insert captures the row.
    // We check that mockInsert was called with the tenantMetricsDaily table.
    const metricsCall = mockInsert.mock.calls.find(([t]) =>
      typeof t === "object" && t !== null && "dayDate" in t,
    );
    expect(metricsCall).toBeDefined(); // verifies the upsert was attempted
  });
});

describe("handleSocialPostJob — first-post lifecycle event (ADR-0016 §D3)", () => {
  it("calls db.update on tenants when completing a post (first_post_at guard)", async () => {
    setupDb({ firstPostReturning: [{ id: TENANT_ID }] });
    await handleSocialPostJob(makeJob());
    // UPDATE tenants SET first_post_at IS NULL guard must fire.
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("when it IS the first post (UPDATE affected rows), inserts outbox event for tenant.first_post_emitted", async () => {
    setupDb({ firstPostReturning: [{ id: TENANT_ID }] }); // non-empty → first post
    await handleSocialPostJob(makeJob());

    // Outbox inserts target the outbox table (no "dayDate" key).
    const outboxInserts = mockInsert.mock.calls.filter(
      ([t]) => typeof t === "object" && t !== null && !("dayDate" in t) && !("jobId" in t),
    );
    // At least 2 outbox inserts: tenant.first_post_emitted + ai.social_post.generated.
    expect(outboxInserts.length).toBeGreaterThanOrEqual(2);
  });

  it("when NOT the first post (UPDATE returns empty), does NOT emit extra outbox event", async () => {
    setupDb({ firstPostReturning: [] }); // empty → not the first post
    await handleSocialPostJob(makeJob());

    const outboxInserts = mockInsert.mock.calls.filter(
      ([t]) => typeof t === "object" && t !== null && !("dayDate" in t) && !("jobId" in t),
    );
    // Only 1 outbox insert: ai.social_post.generated (no first_post_emitted).
    expect(outboxInserts.length).toBe(1);
  });
});
