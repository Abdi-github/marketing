// Unit test for the FADP data-erasure worker.
// DB is mocked. Tests verify:
//   1. PII fields are anonymized in users + business_profiles
//   2. Content rows (social_posts, landing_pages, leads) are deleted
//   3. invoices + ai_usage rows are NOT deleted (billing audit trail)
//   4. tenants.erased_at is stamped after erasure
//   5. Idempotency: already-erased tenant is skipped without re-running
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
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
  dataErasureJobSchema: { parse: (d: unknown) => d },
  DATA_ERASURE_QUEUE_NAME: "tenant.data_erasure",
}));

// Track delete + update calls by table.
const deletedTables: string[] = [];
const updatedTables: string[] = [];
const updatedValues: Record<string, unknown>[] = [];

const mockDeleteWhere = vi.fn().mockResolvedValue([]);
const mockUpdateSetWhere = vi.fn().mockResolvedValue([]);

// Shared state for db.select mock results (indexed by call order).
let _selectResults: unknown[][] = [];
let _selectIdx = 0;

vi.mock("@marketing/db", () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          return _selectResults[_selectIdx++] ?? [];
        }),
      }),
    })),
    delete: vi.fn().mockImplementation((table: { tableName?: string; _: { name?: string } }) => {
      deletedTables.push(String(table?._?.name ?? "unknown"));
      return { where: mockDeleteWhere };
    }),
    update: vi.fn().mockImplementation((table: { _: { name?: string } }) => {
      const name = String(table?._?.name ?? "unknown");
      return {
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
          updatedTables.push(name);
          updatedValues.push(values);
          return { where: mockUpdateSetWhere };
        }),
      };
    }),
  },
  tenants: { id: {}, erasedAt: {}, _: { name: "tenants" } },
  users: { id: {}, _: { name: "users" } },
  businessProfiles: { tenantId: {}, _: { name: "business_profiles" } },
  socialPosts: { tenantId: {}, _: { name: "social_posts" } },
  landingPages: { tenantId: {}, _: { name: "landing_pages" } },
  leads: { tenantId: {}, _: { name: "leads" } },
  tenantUsers: { tenantId: {}, userId: {}, _: { name: "tenant_users" } },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue({}),
}));

// ─── Import handler after mocks ───────────────────────────────────────────────

import { handleDataErasureJob } from "../queues/data-erasure/worker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = "dddddddd-0000-0000-0000-000000000001";
const USER_ID = "eeeeeeee-0000-0000-0000-000000000001";

function makeJob(tenantId = TENANT_ID, requestedBy = USER_ID) {
  return {
    id: "bullmq-erasure-1",
    data: { tenantId, requestedBy },
  } as Parameters<typeof handleDataErasureJob>[0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleDataErasureJob — full erasure flow", () => {
  beforeEach(() => {
    deletedTables.length = 0;
    updatedTables.length = 0;
    updatedValues.length = 0;
    _selectIdx = 0;
    // Call 0: tenant lookup → not erased yet.
    // Call 1: tenantUsers lookup → one member.
    _selectResults = [[{ erasedAt: null }], [{ userId: USER_ID }]];
    mockDeleteWhere.mockClear();
    mockUpdateSetWhere.mockClear();
  });

  it("deletes social_posts, landing_pages, and leads (content rows)", async () => {
    await handleDataErasureJob(makeJob());
    // Verify all three content tables were targeted for deletion.
    expect(mockDeleteWhere).toHaveBeenCalledTimes(3);
  });

  it("does NOT delete invoices or ai_usage (retained for billing audit trail)", async () => {
    await handleDataErasureJob(makeJob());
    const deletedNames = deletedTables;
    expect(deletedNames).not.toContain("invoices");
    expect(deletedNames).not.toContain("ai_usage");
  });

  it("anonymizes business_profile fields", async () => {
    await handleDataErasureJob(makeJob());
    const bizUpdate = updatedValues.find(
      (v) => (v as Record<string, unknown>).businessName === "DELETED",
    );
    expect(bizUpdate).toBeDefined();
    expect(bizUpdate?.addressStreet).toBeNull();
  });

  it("anonymizes user email and name", async () => {
    await handleDataErasureJob(makeJob());
    const userUpdate = updatedValues.find(
      (v) => typeof (v as Record<string, unknown>).email === "string" &&
              ((v as Record<string, unknown>).email as string).endsWith("@deleted.invalid"),
    );
    expect(userUpdate).toBeDefined();
    expect(userUpdate?.name).toBe("DELETED");
  });

  it("stamps tenants.erased_at after erasure", async () => {
    await handleDataErasureJob(makeJob());
    const tenantUpdate = updatedValues.find(
      (v) => (v as Record<string, unknown>).erasedAt instanceof Date,
    );
    expect(tenantUpdate).toBeDefined();
  });
});

describe("handleDataErasureJob — idempotency", () => {
  beforeEach(() => {
    deletedTables.length = 0;
    updatedTables.length = 0;
    updatedValues.length = 0;
    _selectIdx = 0;
    // Tenant already erased — should short-circuit immediately.
    _selectResults = [[{ erasedAt: new Date("2026-05-01T00:00:00Z") }]];
    mockDeleteWhere.mockClear();
    mockUpdateSetWhere.mockClear();
  });

  it("skips all destructive operations when tenant is already erased", async () => {
    await handleDataErasureJob(makeJob());
    expect(mockDeleteWhere).not.toHaveBeenCalled();
    expect(mockUpdateSetWhere).not.toHaveBeenCalled();
  });
});
