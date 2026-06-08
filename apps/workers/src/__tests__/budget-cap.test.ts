// Unit test: monthly budget cap enforcement in social-post worker.
// Validates that jobs are aborted (UnrecoverableError) when MTD spend >= plan cap.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn() })),
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "UnrecoverableError";
    }
  },
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    ping: vi.fn(),
    on: vi.fn(),
    get: vi.fn().mockResolvedValue(null),     // Redis miss → DB fallback
    set: vi.fn().mockResolvedValue("OK"),
    incrbyfloat: vi.fn().mockResolvedValue("0.0004"),
    expire: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue({
      incrbyfloat: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  })),
}));

const mockRoute = vi.fn().mockResolvedValue({
  text: "Generated post",
  inputTokens: 100,
  outputTokens: 40,
  costUsd: 0.0004,
  model: "claude-haiku-4-5-20251001",
  provider: "anthropic",
  latencyMs: 500,
});

vi.mock("@marketing/ai-router", () => ({
  ProviderRouter: vi.fn().mockImplementation(() => ({ route: mockRoute })),
  EchoProvider: vi.fn().mockImplementation(() => ({
    id: "echo",
    model: "echo-1",
    complete: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
  })),
  createAnthropicSonnet: vi.fn().mockReturnValue({ id: "anthropic:sonnet" }),
  createAnthropicHaiku: vi.fn().mockReturnValue({ id: "anthropic:haiku" }),
  createOpenAIMini: vi.fn().mockReturnValue({ id: "openai:mini" }),
  getPrompt: vi.fn().mockReturnValue({
    id: "social-post-v1",
    version: 1,
    systemPrompt: "System",
    buildUserPrompt: vi.fn().mockReturnValue("User prompt"),
  }),
  socialPostJobSchema: { parse: (d: unknown) => d },
  SOCIAL_POST_QUEUE_NAME: "ai.social_post.generate",
}));

vi.mock("@marketing/billing", () => ({
  getPlanCaps: vi.fn((plan: string) => {
    if (plan === "trial") return { monthlyAiBudgetUsd: 1.0, perJobBudgetCents: 50, displayName: "Trial" };
    if (plan === "starter") return { monthlyAiBudgetUsd: 10.0, perJobBudgetCents: 50, displayName: "Starter" };
    return { monthlyAiBudgetUsd: 40.0, perJobBudgetCents: 50, displayName: "Growth" };
  }),
  monthlyBudgetKey: vi.fn().mockReturnValue("budget:monthly:t1:2026-05"),
  BUDGET_KEY_TTL_SECONDS: 3024000,
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
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let _selectCall = 0;
let _existingPost: unknown = null;
let _tenantPlan = "trial";
let _mtdSpendUsd = 0;

vi.mock("@marketing/db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          const n = _selectCall++;
          // 1st select: existing post check
          if (n === 0) return _existingPost ? [_existingPost] : [];
          // 2nd select: getTenantPlan
          if (n === 1) return [{ plan: _tenantPlan }];
          // 3rd select: DB aggregate for monthly spend (Redis miss fallback)
          return [{ total: String(_mtdSpendUsd) }];
        }),
      }),
    })),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "usage-id-001" }]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  aiUsage: { jobId: {}, tenantId: {}, createdAt: {} },
  socialPosts: { jobId: {}, tenantId: {} },
  tenants: {},
  outbox: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue({}),
  and: vi.fn().mockReturnValue({}),
  sql: vi.fn().mockReturnValue({}),
  gte: vi.fn().mockReturnValue({}),
}));

// ─── Import handler after mocks ───────────────────────────────────────────────
import { handleSocialPostJob, setRouterForTest } from "../queues/social-post/worker";
import { ProviderRouter } from "@marketing/ai-router";
import { UnrecoverableError } from "bullmq";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JOB_DATA = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  jobId: "00000000-0000-0000-0000-000000000002",
  userId: "00000000-0000-0000-0000-000000000003",
  businessName: "Café Test",
  vertical: "cafe" as const,
  city: "Zürich",
  locale: "de-CH",
  topic: "Cappuccino",
  highlights: "Bio-Milch",
  idempotencyKey: "00000000-0000-0000-0000-000000000002",
  promptId: "social-post-v1",
  promptVersion: 1,
  costBudgetCents: 50,
};

function makeJob(data = JOB_DATA) {
  return { id: data.jobId, data } as Parameters<typeof handleSocialPostJob>[0];
}

function injectMockRouter() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = new (ProviderRouter as unknown as new (...a: any[]) => { route: typeof mockRoute })();
  setRouterForTest(r as unknown as ProviderRouter);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("budget cap enforcement — unit", () => {
  beforeEach(() => {
    _selectCall = 0;
    _existingPost = null;
    _tenantPlan = "trial";
    _mtdSpendUsd = 0;
    mockRoute.mockClear();
    injectMockRouter();
  });

  it("allows job when MTD spend is below trial cap (USD 1.00)", async () => {
    _mtdSpendUsd = 0.5; // under $1 cap
    await handleSocialPostJob(makeJob());
    expect(mockRoute).toHaveBeenCalledOnce();
  });

  it("throws UnrecoverableError when trial MTD spend equals the cap", async () => {
    _mtdSpendUsd = 1.0; // exactly at $1 cap — should be blocked
    await expect(handleSocialPostJob(makeJob())).rejects.toThrow(UnrecoverableError);
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("throws UnrecoverableError when trial MTD spend exceeds the cap", async () => {
    _mtdSpendUsd = 1.5;
    await expect(handleSocialPostJob(makeJob())).rejects.toThrow(UnrecoverableError);
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it("budget exceeded error message includes plan name and cap amount", async () => {
    _mtdSpendUsd = 1.0;
    const err = await handleSocialPostJob(makeJob()).catch((e) => e);
    expect(err.message).toContain("trial");
    expect(err.message).toContain("1.00");
  });

  it("starter plan allows spend below USD 10 cap", async () => {
    _tenantPlan = "starter";
    _mtdSpendUsd = 9.99;
    await handleSocialPostJob(makeJob());
    expect(mockRoute).toHaveBeenCalledOnce();
  });

  it("starter plan blocks spend at USD 10 cap", async () => {
    _tenantPlan = "starter";
    _mtdSpendUsd = 10.0;
    await expect(handleSocialPostJob(makeJob())).rejects.toThrow(UnrecoverableError);
  });

  it("growth plan allows spend below USD 40 cap", async () => {
    _tenantPlan = "growth";
    _mtdSpendUsd = 39.99;
    await handleSocialPostJob(makeJob());
    expect(mockRoute).toHaveBeenCalledOnce();
  });

  it("growth plan blocks spend at USD 40 cap", async () => {
    _tenantPlan = "growth";
    _mtdSpendUsd = 40.0;
    await expect(handleSocialPostJob(makeJob())).rejects.toThrow(UnrecoverableError);
  });
});
