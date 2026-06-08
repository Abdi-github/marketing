// Unit test for the integration-event worker handler.
// DB, BullMQ, and Redis are mocked. Tests verify:
//   1. Gastrofix reservation.created → social-post job enqueued with valid payload
//   2. Eversports booking.created → social-post job enqueued with valid payload
//   3. Already-processed event (processedAt set) → no job enqueued
//   4. Suspended tenant → UnrecoverableError, no job enqueued
//   5. Missing business profile → skips fan-out, marks event processed
//   6. Unknown provider/eventType → no job enqueued, event still marked processed
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnrecoverableError as _UnrecoverableError } from "bullmq";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn() })),
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(msg: string) { super(msg); this.name = "UnrecoverableError"; }
  },
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({ on: vi.fn(), ping: vi.fn() })),
}));

vi.mock("@marketing/shared", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    DATABASE_URL: "postgres://localhost/test",
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    BETTER_AUTH_SECRET: "test",
    BETTER_AUTH_URL: "http://localhost:3000",
    OTEL_SERVICE_NAME: "test",
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  recordMetric: vi.fn(),
  hashId: (id: string) => `hashed:${id}`,
}));

vi.mock("@marketing/ai-router", () => ({
  integrationEventJobSchema: { parse: (d: unknown) => d },
  INTEGRATION_EVENT_QUEUE_NAME: "integrations.event.process",
  SOCIAL_POST_QUEUE_NAME: "ai.social_post.generate",
}));

// Shared DB state for tests.
let _dbSelectResults: unknown[][] = [];
let _selectIdx = 0;
const mockDbAdd = vi.fn().mockResolvedValue(undefined);
const mockDbUpdateWhere = vi.fn().mockResolvedValue([]);

vi.mock("@marketing/db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          return _dbSelectResults[_selectIdx++] ?? [];
        }),
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: mockDbUpdateWhere,
      }),
    }),
  },
  webhookEvents: { id: {}, processedAt: {} },
  tenants: { id: {}, suspended: {} },
  businessProfiles: { tenantId: {}, businessName: {}, vertical: {}, locale: {} },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue({}),
  and: vi.fn().mockReturnValue({}),
  isNull: vi.fn().mockReturnValue({}),
}));

// ─── Import handler + test seam after mocks ───────────────────────────────────

import {
  handleIntegrationEventJob,
  setSocialPostQueueForTest,
} from "../queues/integration-event/worker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const EVENT_ID = "bbbbbbbb-0000-0000-0000-000000000002";

const BIZ_PROFILE = {
  businessName: "Zum Goldenen Raben",
  vertical: "restaurant" as const,
  locale: "de-CH",
};

const BIZ_PROFILE_FITNESS = {
  businessName: "Fit & Flow Studio",
  vertical: "fitness_studio" as const,
  locale: "de-CH",
};

function makeJob(
  provider: string,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  return {
    id: "bullmq-job-1",
    data: { tenantId: TENANT_ID, webhookEventId: EVENT_ID, provider, eventType, payload },
  } as Parameters<typeof handleIntegrationEventJob>[0];
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const mockQueue = { add: mockDbAdd, on: vi.fn() };

beforeEach(() => {
  _selectIdx = 0;
  _dbSelectResults = [];
  mockDbAdd.mockClear();
  mockDbUpdateWhere.mockClear();
  // Inject mock queue so no real Redis connection is created.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSocialPostQueueForTest(mockQueue as any);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleIntegrationEventJob — gastrofix reservation.created", () => {
  it("enqueues a social-post job with valid UUID userId and non-empty businessName", async () => {
    // DB calls: [0] event lookup (unprocessed), [1] suspended check, [2] business profile
    _dbSelectResults = [
      [{ id: EVENT_ID, processedAt: null }],
      [{ suspended: false }],
      [BIZ_PROFILE],
    ];

    await handleIntegrationEventJob(
      makeJob("gastrofix", "reservation.created", { guestCount: 4 }),
    );

    expect(mockDbAdd).toHaveBeenCalledOnce();
    const [, jobData] = mockDbAdd.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobData.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof jobData.businessName).toBe("string");
    expect((jobData.businessName as string).length).toBeGreaterThan(0);
    expect(jobData.businessName).toBe("Zum Goldenen Raben");
    expect(jobData.vertical).toBe("restaurant");
    // Event must be stamped processed.
    expect(mockDbUpdateWhere).toHaveBeenCalled();
  });
});

describe("handleIntegrationEventJob — eversports booking.created", () => {
  it("enqueues a social-post job with fitness_studio vertical", async () => {
    _dbSelectResults = [
      [{ id: EVENT_ID, processedAt: null }],
      [{ suspended: false }],
      [BIZ_PROFILE_FITNESS],
    ];

    await handleIntegrationEventJob(
      makeJob("eversports", "booking.created", { activityName: "Yoga Flow" }),
    );

    expect(mockDbAdd).toHaveBeenCalledOnce();
    const [, jobData] = mockDbAdd.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobData.vertical).toBe("fitness_studio");
    expect(jobData.businessName).toBe("Fit & Flow Studio");
  });
});

describe("handleIntegrationEventJob — idempotency", () => {
  it("skips fan-out when event is already processed (processedAt set)", async () => {
    // Return empty array for unprocessed-event lookup → already processed.
    _dbSelectResults = [[]];

    await handleIntegrationEventJob(makeJob("gastrofix", "reservation.created"));

    expect(mockDbAdd).not.toHaveBeenCalled();
    expect(mockDbUpdateWhere).not.toHaveBeenCalled();
  });
});

describe("handleIntegrationEventJob — suspended tenant", () => {
  it("throws UnrecoverableError and does not enqueue a job", async () => {
    _dbSelectResults = [
      [{ id: EVENT_ID, processedAt: null }],
      [{ suspended: true }],
    ];

    await expect(
      handleIntegrationEventJob(makeJob("gastrofix", "reservation.created")),
    ).rejects.toThrow("suspended");

    expect(mockDbAdd).not.toHaveBeenCalled();
  });
});

describe("handleIntegrationEventJob — missing business profile", () => {
  it("skips fan-out but still marks event processed", async () => {
    _dbSelectResults = [
      [{ id: EVENT_ID, processedAt: null }],
      [{ suspended: false }],
      [], // no business profile
    ];

    await handleIntegrationEventJob(makeJob("gastrofix", "reservation.created"));

    expect(mockDbAdd).not.toHaveBeenCalled();
    expect(mockDbUpdateWhere).toHaveBeenCalled();
  });
});

describe("handleIntegrationEventJob — unknown event type", () => {
  it("does not enqueue a job but still marks event processed", async () => {
    _dbSelectResults = [
      [{ id: EVENT_ID, processedAt: null }],
      [{ suspended: false }],
      [BIZ_PROFILE],
    ];

    await handleIntegrationEventJob(makeJob("gastrofix", "unknown.event"));

    expect(mockDbAdd).not.toHaveBeenCalled();
    expect(mockDbUpdateWhere).toHaveBeenCalled();
  });
});
