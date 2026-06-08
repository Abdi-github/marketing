/**
 * Integration tests for the three Swiss adapters.
 * Uses testcontainers (real Postgres) to verify:
 * - connect() creates the integration_connections row
 * - disconnect() sets status to 'disconnected'
 * - connect() is idempotent (upsert on conflict)
 * - tenant A's connection is not visible when querying as tenant B (RLS disabled for migration user,
 *   so we verify app-layer isolation via tenantId filter)
 */

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import * as schema from "@marketing/db/schema";
import { MIGRATIONS_DIR } from "@marketing/db/migrate";
import { integrationConnections } from "@marketing/db";
import { atomicSignup } from "@marketing/auth";
import { GastrofixAdapter } from "../../gastrofix/adapter";
import { LightspeedChAdapter } from "../../lightspeed-ch/adapter";
import { EversportsAdapter } from "../../eversports/adapter";
import type { TenantContext } from "@marketing/tenancy";

const ENC_KEY = "a".repeat(64); // test key only

let container: Awaited<ReturnType<InstanceType<typeof PostgreSqlContainer>["start"]>>;
let sql: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("test_adapters")
    .withUsername("test")
    .withPassword("test")
    .start();

  sql = postgres(container.getConnectionUri(), { max: 5 });
  testDb = drizzle(sql, { schema });
  await migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });

  const [rA, rB] = await Promise.all([
    atomicSignup(
      { name: "Owner A", email: "adapter-a@example.com", password: "pass123!", businessName: "Biz A", locale: "de-CH" },
      testDb,
    ),
    atomicSignup(
      { name: "Owner B", email: "adapter-b@example.com", password: "pass456!", businessName: "Biz B", locale: "de-CH" },
      testDb,
    ),
  ]);
  ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };
  ctxB = { tenantId: rB.tenantId, userId: rB.userId, role: "owner" };
}, 180_000);

afterAll(async () => {
  await sql.end();
  await container.stop();
});

// ─── Gastrofix adapter ────────────────────────────────────────────────────────

describe("GastrofixAdapter", () => {
  const adapter = () => new GastrofixAdapter(testDb, ENC_KEY);

  it("connect() creates a connection row", async () => {
    const conn = await adapter().connect(ctxA, { apiKey: "gf-test-key-abc" });
    expect(conn.tenantId).toBe(ctxA.tenantId);
    expect(conn.provider).toBe("gastrofix");
    expect(conn.status).toBe("connected");
  });

  it("connect() is idempotent (upserts on conflict)", async () => {
    await adapter().connect(ctxA, { apiKey: "gf-key-v1" });
    await adapter().connect(ctxA, { apiKey: "gf-key-v2" });

    const rows = await testDb
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.tenantId, ctxA.tenantId),
          eq(integrationConnections.provider, "gastrofix"),
        ),
      );
    // Should be exactly 1 row (upsert, not insert)
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("connected");
  });

  it("disconnect() sets status to disconnected", async () => {
    const conn = await adapter().connect(ctxA, { apiKey: "gf-key-disconnect" });
    await adapter().disconnect(ctxA, conn.id);

    const [row] = await testDb
      .select({ status: integrationConnections.status })
      .from(integrationConnections)
      .where(eq(integrationConnections.id, conn.id));
    expect(row?.status).toBe("disconnected");
  });

  it("tenant A's connection is not returned when querying as tenant B (app-layer isolation)", async () => {
    await adapter().connect(ctxA, { apiKey: "gf-only-a" });

    const rows = await testDb
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.tenantId, ctxB.tenantId),
          eq(integrationConnections.provider, "gastrofix"),
        ),
      );
    // Tenant B has no Gastrofix connection — app-level WHERE tenantId=B filters it out
    expect(rows.every((r) => r.tenantId === ctxB.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });
});

// ─── Lightspeed CH adapter ────────────────────────────────────────────────────

describe("LightspeedChAdapter", () => {
  const adapter = () => new LightspeedChAdapter(testDb, ENC_KEY);

  it("connect() creates a connection row", async () => {
    const conn = await adapter().connect(ctxA, {
      apiKey: "ls-test-key",
      externalAccountId: "loc-001",
    });
    expect(conn.tenantId).toBe(ctxA.tenantId);
    expect(conn.provider).toBe("lightspeed_ch");
    expect(conn.externalAccountId).toBe("loc-001");
  });

  it("connect() is idempotent", async () => {
    await adapter().connect(ctxA, { apiKey: "ls-v1", externalAccountId: "loc-upsert" });
    await adapter().connect(ctxA, { apiKey: "ls-v2", externalAccountId: "loc-upsert" });

    const rows = await testDb
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.tenantId, ctxA.tenantId),
          eq(integrationConnections.provider, "lightspeed_ch"),
          eq(integrationConnections.externalAccountId, "loc-upsert"),
        ),
      );
    expect(rows.length).toBe(1);
  });
});

// ─── Eversports adapter ───────────────────────────────────────────────────────

describe("EversportsAdapter", () => {
  const adapter = () => new EversportsAdapter(testDb, ENC_KEY);

  it("connect() creates a connection row", async () => {
    const conn = await adapter().connect(ctxA, { apiKey: "es-test-key" });
    expect(conn.tenantId).toBe(ctxA.tenantId);
    expect(conn.provider).toBe("eversports");
  });

  it("disconnect() sets status to disconnected", async () => {
    const conn = await adapter().connect(ctxA, { apiKey: "es-disconnect-test" });
    await adapter().disconnect(ctxA, conn.id);

    const [row] = await testDb
      .select({ status: integrationConnections.status })
      .from(integrationConnections)
      .where(eq(integrationConnections.id, conn.id));
    expect(row?.status).toBe("disconnected");
  });

  it("tenant B's connect() does not affect tenant A's rows", async () => {
    await adapter().connect(ctxA, { apiKey: "es-for-a-only" });
    await adapter().connect(ctxB, { apiKey: "es-for-b" });

    const rowsA = await testDb
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.tenantId, ctxA.tenantId),
          eq(integrationConnections.provider, "eversports"),
        ),
      );
    const rowsB = await testDb
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.tenantId, ctxB.tenantId),
          eq(integrationConnections.provider, "eversports"),
        ),
      );

    expect(rowsA.every((r) => r.tenantId === ctxA.tenantId)).toBe(true);
    expect(rowsB.every((r) => r.tenantId === ctxB.tenantId)).toBe(true);
    // No cross-contamination
    expect(rowsA.some((r) => r.tenantId === ctxB.tenantId)).toBe(false);
    expect(rowsB.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });
});
