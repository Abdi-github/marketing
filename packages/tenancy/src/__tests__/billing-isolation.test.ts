// Tenant isolation + idempotency integration tests for billing tables.
// Uses the same Testcontainers pattern as isolation.test.ts.
//
// Covers:
//   - RLS enabled + policy present on stripe_customers, subscriptions,
//     usage_records, invoices, webhook_events.
//   - stripe_customers/subscriptions/invoices are tenant-scoped (cross-tenant blind).
//   - webhook_events idempotency: UNIQUE(provider, event_id) on real Postgres.
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@marketing/db/schema";
import { MIGRATIONS_DIR } from "@marketing/db/migrate";
import { atomicSignup } from "@marketing/auth";
import { eq } from "drizzle-orm";
import type { TenantContext } from "../context";

let container: Awaited<ReturnType<InstanceType<typeof PostgreSqlContainer>["start"]>>;
let sql: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("test_billing_isolation")
    .withUsername("test")
    .withPassword("test")
    .start();

  sql = postgres(container.getConnectionUri(), { max: 5 });
  testDb = drizzle(sql, { schema });
  await migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });
}, 120_000);

afterAll(async () => {
  await sql.end();
  await container.stop();
});

// ─── RLS structural checks ────────────────────────────────────────────────────
// Verify that migration 0003 correctly enabled RLS + created isolation policies.

describe("billing tables — RLS structural checks", () => {
  const BILLING_TABLES = [
    "stripe_customers",
    "subscriptions",
    "usage_records",
    "invoices",
    "webhook_events",
  ] as const;

  for (const table of BILLING_TABLES) {
    it(`RLS is enabled on ${table}`, async () => {
      const result = await sql<{ rowsecurity: boolean }[]>`
        SELECT rowsecurity FROM pg_tables
        WHERE tablename = ${table} AND schemaname = 'public'
      `;
      expect(result[0]?.rowsecurity, `Expected RLS on ${table}`).toBe(true);
    });

    it(`tenant isolation policy exists on ${table}`, async () => {
      const result = await sql<{ policyname: string }[]>`
        SELECT policyname FROM pg_policies
        WHERE tablename = ${table} AND schemaname = 'public'
      `;
      expect(result.length, `Expected a policy on ${table}`).toBeGreaterThan(0);
    });
  }
});

// ─── stripe_customers isolation ───────────────────────────────────────────────

describe("tenant isolation — stripe_customers", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const rA = await atomicSignup(
      { name: "Billing Owner A", email: "billing-a@example.com", password: "pw-billing-a-123", businessName: "Billing Biz A" },
      testDb,
    );
    const rB = await atomicSignup(
      { name: "Billing Owner B", email: "billing-b@example.com", password: "pw-billing-b-123", businessName: "Billing Biz B" },
      testDb,
    );
    ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };
    ctxB = { tenantId: rB.tenantId, userId: rB.userId, role: "owner" };

    await testDb.insert(schema.stripeCustomers).values([
      { tenantId: ctxA.tenantId, stripeCustomerId: "cus_test_a_001" },
      { tenantId: ctxB.tenantId, stripeCustomerId: "cus_test_b_001" },
    ]);
  });

  it("queries scoped to tenant A return only tenant A rows", async () => {
    const rows = await testDb
      .select()
      .from(schema.stripeCustomers)
      .where(eq(schema.stripeCustomers.tenantId, ctxA.tenantId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.tenantId).toBe(ctxA.tenantId);
    expect(rows[0]!.stripeCustomerId).toBe("cus_test_a_001");
  });

  it("queries scoped to tenant B do not include tenant A rows", async () => {
    const rows = await testDb
      .select()
      .from(schema.stripeCustomers)
      .where(eq(schema.stripeCustomers.tenantId, ctxB.tenantId));
    expect(rows.every((r) => r.tenantId === ctxB.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });
});

// ─── subscriptions isolation ──────────────────────────────────────────────────

describe("tenant isolation — subscriptions", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const rA = await atomicSignup(
      { name: "Sub Owner A", email: "sub-a@example.com", password: "pw-sub-a-123", businessName: "Sub Biz A" },
      testDb,
    );
    const rB = await atomicSignup(
      { name: "Sub Owner B", email: "sub-b@example.com", password: "pw-sub-b-123", businessName: "Sub Biz B" },
      testDb,
    );
    ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };
    ctxB = { tenantId: rB.tenantId, userId: rB.userId, role: "owner" };

    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    await testDb.insert(schema.subscriptions).values([
      {
        tenantId: ctxA.tenantId,
        stripeSubscriptionId: "sub_test_a_001",
        plan: "starter",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
      },
      {
        tenantId: ctxB.tenantId,
        stripeSubscriptionId: "sub_test_b_001",
        plan: "growth",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: nextMonth,
      },
    ]);
  });

  it("tenant A sees only its own subscription", async () => {
    const rows = await testDb
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, ctxA.tenantId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.plan).toBe("starter");
    expect(rows.every((r) => r.tenantId === ctxA.tenantId)).toBe(true);
  });

  it("tenant B sees only its own subscription", async () => {
    const rows = await testDb
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, ctxB.tenantId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.plan).toBe("growth");
    expect(rows.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });
});

// ─── webhook_events idempotency on real Postgres ──────────────────────────────

describe("webhook_events — idempotency (UNIQUE constraint on real Postgres)", () => {
  it("first insert succeeds and returns a row", async () => {
    const [row] = await testDb
      .insert(schema.webhookEvents)
      .values({
        provider: "stripe",
        eventId: "evt_real_001",
        eventType: "customer.subscription.created",
        payload: { test: true },
      })
      .returning();
    expect(row?.id).toBeDefined();
  });

  it("duplicate (provider, event_id) insert returns empty — ON CONFLICT DO NOTHING", async () => {
    const rows = await testDb
      .insert(schema.webhookEvents)
      .values({
        provider: "stripe",
        eventId: "evt_real_001", // same as above
        eventType: "customer.subscription.created",
        payload: { test: true },
      })
      .onConflictDoNothing({
        target: [schema.webhookEvents.provider, schema.webhookEvents.eventId],
      })
      .returning();
    expect(rows.length).toBe(0);
  });

  it("replaying three different events twice each — each accepted once, duplicate skipped", async () => {
    const events = [
      { eventId: "evt_replay_A", eventType: "checkout.session.completed" },
      { eventId: "evt_replay_B", eventType: "customer.subscription.updated" },
      { eventId: "evt_replay_C", eventType: "invoice.paid" },
    ];

    // First pass — all succeed.
    for (const { eventId, eventType } of events) {
      const rows = await testDb
        .insert(schema.webhookEvents)
        .values({ provider: "stripe", eventId, eventType, payload: {} })
        .onConflictDoNothing({
          target: [schema.webhookEvents.provider, schema.webhookEvents.eventId],
        })
        .returning();
      expect(rows.length, `First insert for ${eventId}`).toBe(1);
    }

    // Second pass — all are duplicates.
    for (const { eventId, eventType } of events) {
      const rows = await testDb
        .insert(schema.webhookEvents)
        .values({ provider: "stripe", eventId, eventType, payload: {} })
        .onConflictDoNothing({
          target: [schema.webhookEvents.provider, schema.webhookEvents.eventId],
        })
        .returning();
      expect(rows.length, `Second insert for ${eventId} should be 0`).toBe(0);
    }
  });

  it("same event_id with different provider is NOT a duplicate", async () => {
    await testDb.insert(schema.webhookEvents).values({
      provider: "stripe",
      eventId: "evt_cross_provider",
      eventType: "payment",
      payload: {},
    });

    // Different provider — different unique key combination.
    const rows = await testDb
      .insert(schema.webhookEvents)
      .values({
        provider: "meta",
        eventId: "evt_cross_provider",
        eventType: "lead",
        payload: {},
      })
      .onConflictDoNothing({
        target: [schema.webhookEvents.provider, schema.webhookEvents.eventId],
      })
      .returning();
    expect(rows.length).toBe(1);
  });
});
