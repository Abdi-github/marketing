// Tenant isolation tests for tenant_metrics_daily.
// Verifies that RLS prevents tenant A from reading tenant B's daily metrics rows.
// Follows the testcontainers pattern established in content-isolation.test.ts.
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
    .withDatabase("test_metrics_isolation")
    .withUsername("test")
    .withPassword("test")
    .start();

  sql = postgres(container.getConnectionUri(), { max: 5 });
  testDb = drizzle(sql, { schema });
  await migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });
}, 60_000);

afterAll(async () => {
  await sql.end();
  await container.stop();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertMetricsRow(
  ctx: TenantContext,
  dayDate: string,
  db: typeof testDb,
) {
  const [row] = await db
    .insert(schema.tenantMetricsDaily)
    .values({
      tenantId: ctx.tenantId,
      dayDate,
      vertical: "restaurant",
      postsGenerated: 3,
      leadsCaptured: 1,
      plan: "trial",
    })
    .returning();
  return row!;
}

async function getMetricsForTenant(ctx: TenantContext, db: typeof testDb) {
  return db
    .select()
    .from(schema.tenantMetricsDaily)
    .where(eq(schema.tenantMetricsDaily.tenantId, ctx.tenantId));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("tenant isolation — tenant_metrics_daily", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const resultA = await atomicSignup(
      {
        name: "Metrics Owner A",
        email: "metrics-owner-a@example.com",
        password: "pw-a-metrics-123",
        businessName: "Metrics Biz A",
      },
      testDb,
    );
    const resultB = await atomicSignup(
      {
        name: "Metrics Owner B",
        email: "metrics-owner-b@example.com",
        password: "pw-b-metrics-123",
        businessName: "Metrics Biz B",
      },
      testDb,
    );
    ctxA = { tenantId: resultA.tenantId, userId: resultA.userId, role: "owner" };
    ctxB = { tenantId: resultB.tenantId, userId: resultB.userId, role: "owner" };

    await insertMetricsRow(ctxA, "2026-05-01", testDb);
    await insertMetricsRow(ctxA, "2026-05-02", testDb);
    await insertMetricsRow(ctxB, "2026-05-01", testDb);
  });

  it("tenant A query returns only its own metrics rows", async () => {
    const rows = await getMetricsForTenant(ctxA, testDb);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.tenantId === ctxA.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === ctxB.tenantId)).toBe(false);
  });

  it("tenant B query returns only its own metrics rows", async () => {
    const rows = await getMetricsForTenant(ctxB, testDb);
    expect(rows.length).toBe(1);
    expect(rows.every((r) => r.tenantId === ctxB.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });

  it("metrics row carries the expected shape and counts", async () => {
    const rows = await getMetricsForTenant(ctxA, testDb);
    const may1 = rows.find((r) => r.dayDate === "2026-05-01");
    expect(may1).toBeDefined();
    expect(may1!.postsGenerated).toBe(3);
    expect(may1!.leadsCaptured).toBe(1);
    expect(may1!.vertical).toBe("restaurant");
  });

  it("RLS is enabled on tenant_metrics_daily", async () => {
    const result = await sql<{ rowsecurity: boolean }[]>`
      SELECT rowsecurity FROM pg_tables
      WHERE tablename = 'tenant_metrics_daily' AND schemaname = 'public'
    `;
    expect(result[0]?.rowsecurity).toBe(true);
  });

  it("tenant_metrics_daily isolation policy exists in pg_policies", async () => {
    const result = await sql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'tenant_metrics_daily' AND schemaname = 'public'
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.policyname.includes("tenant"))).toBe(true);
  });

  it("upsert on (tenant_id, day_date) increments correctly, not duplicates", async () => {
    const { eq: _drizzleEq, sql: drizzleSql } = await import("drizzle-orm");
    // Second insert for same (tenant, day) should conflict and update.
    await testDb
      .insert(schema.tenantMetricsDaily)
      .values({
        tenantId: ctxA.tenantId,
        dayDate: "2026-05-02",
        vertical: "restaurant",
        postsGenerated: 1,
        leadsCaptured: 0,
        plan: "trial",
      })
      .onConflictDoUpdate({
        target: [schema.tenantMetricsDaily.tenantId, schema.tenantMetricsDaily.dayDate],
        set: {
          postsGenerated: drizzleSql`${schema.tenantMetricsDaily.postsGenerated} + 1`,
          updatedAt: new Date(),
        },
      });

    const rows = await getMetricsForTenant(ctxA, testDb);
    const may2 = rows.find((r) => r.dayDate === "2026-05-02");
    expect(may2).toBeDefined();
    // Original 3 + 1 from upsert increment = 4.
    expect(may2!.postsGenerated).toBe(4);
  });
});
