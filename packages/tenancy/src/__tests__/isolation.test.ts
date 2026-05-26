import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @marketing/db/schema: only schema tables, no singleton DB client init.
// @marketing/db/migrate: MIGRATIONS_DIR path constant, no DB client.
import * as schema from "@marketing/db/schema";
import { MIGRATIONS_DIR } from "@marketing/db/migrate";
import { atomicSignup } from "@marketing/auth";

import type { TenantContext } from "../context";
import {
  createBusinessProfile,
  getBusinessProfile,
} from "../repository/business-profile";
import { listTenantUsers } from "../repository/tenant-users";

// ─── Container lifecycle ──────────────────────────────────────────────────────

let container: Awaited<ReturnType<InstanceType<typeof PostgreSqlContainer>["start"]>>;
let sql: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("test_isolation")
    .withUsername("test")
    .withPassword("test")
    .start();

  sql = postgres(container.getConnectionUri(), { max: 5 });
  testDb = drizzle(sql, { schema });

  await migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });
});

afterAll(async () => {
  await sql.end();
  await container.stop();
});

// ─── Tenant isolation tests ───────────────────────────────────────────────────

describe("tenant isolation — business_profiles", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    // Create two independent tenants via atomic signup.
    const resultA = await atomicSignup(
      {
        name: "Owner A",
        email: "owner-a@example.com",
        password: "password-for-a-123",
        businessName: "Restaurant A",
      },
      testDb,
    );
    const resultB = await atomicSignup(
      {
        name: "Owner B",
        email: "owner-b@example.com",
        password: "password-for-b-123",
        businessName: "Café B",
      },
      testDb,
    );

    ctxA = { tenantId: resultA.tenantId, userId: resultA.userId, role: "owner" };
    ctxB = { tenantId: resultB.tenantId, userId: resultB.userId, role: "owner" };

    // Create a business_profile for each tenant.
    await createBusinessProfile(
      ctxA,
      {
        vertical: "restaurant",
        businessName: "Restaurant A",
        locale: "de-CH",
        addressCountry: "CH",
      },
      testDb,
    );
    await createBusinessProfile(
      ctxB,
      {
        vertical: "cafe",
        businessName: "Café B",
        locale: "de-CH",
        addressCountry: "CH",
      },
      testDb,
    );
  });

  // ─── Application-layer isolation (primary defense) ────────────────────────

  it("tenant A reads only its own profile — not tenant B's", async () => {
    const profile = await getBusinessProfile(ctxA, testDb);
    expect(profile).not.toBeNull();
    expect(profile?.tenantId).toBe(ctxA.tenantId);
    expect(profile?.businessName).toBe("Restaurant A");
    expect(profile?.tenantId).not.toBe(ctxB.tenantId);
  });

  it("tenant B reads only its own profile — not tenant A's", async () => {
    const profile = await getBusinessProfile(ctxB, testDb);
    expect(profile).not.toBeNull();
    expect(profile?.tenantId).toBe(ctxB.tenantId);
    expect(profile?.businessName).toBe("Café B");
    expect(profile?.tenantId).not.toBe(ctxA.tenantId);
  });

  // ─── RLS structural checks (secondary / defense-in-depth) ───────────────────
  // Verify RLS is ENABLED and the isolation policy EXISTS.
  // Full enforcement (FORCE ROW LEVEL SECURITY + non-owner app user) is
  // deferred to the production environment / Phase 7 pen-test.
  // In testcontainers, the migration user is the table owner, so Postgres
  // does not enforce RLS for that user without FORCE.

  it("RLS is enabled on business_profiles (rowsecurity = true)", async () => {
    const result = await sql<{ rowsecurity: boolean }[]>`
      SELECT rowsecurity
      FROM pg_tables
      WHERE tablename = 'business_profiles' AND schemaname = 'public'
    `;
    expect(result[0]?.rowsecurity).toBe(true);
  });

  it("RLS is enabled on tenant_users (rowsecurity = true)", async () => {
    const result = await sql<{ rowsecurity: boolean }[]>`
      SELECT rowsecurity
      FROM pg_tables
      WHERE tablename = 'tenant_users' AND schemaname = 'public'
    `;
    expect(result[0]?.rowsecurity).toBe(true);
  });

  it("business_profiles tenant isolation policy exists in pg_policies", async () => {
    const result = await sql<{ policyname: string }[]>`
      SELECT policyname
      FROM pg_policies
      WHERE tablename = 'business_profiles' AND schemaname = 'public'
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.policyname.includes("tenant"))).toBe(true);
  });
});

// ─── Tenant isolation tests — tenant_users ────────────────────────────────────

describe("tenant isolation — tenant_users", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const resultA = await atomicSignup(
      {
        name: "Member Owner A",
        email: "member-owner-a@example.com",
        password: "password-for-a-456",
        businessName: "Biz A",
      },
      testDb,
    );
    const resultB = await atomicSignup(
      {
        name: "Member Owner B",
        email: "member-owner-b@example.com",
        password: "password-for-b-456",
        businessName: "Biz B",
      },
      testDb,
    );

    ctxA = { tenantId: resultA.tenantId, userId: resultA.userId, role: "owner" };
    ctxB = { tenantId: resultB.tenantId, userId: resultB.userId, role: "owner" };
  });

  it("tenant A sees only its own members", async () => {
    const members = await listTenantUsers(ctxA, testDb);
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((m) => m.tenantId === ctxA.tenantId)).toBe(true);
    expect(members.some((m) => m.tenantId === ctxB.tenantId)).toBe(false);
  });

  it("tenant B sees only its own members", async () => {
    const members = await listTenantUsers(ctxB, testDb);
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((m) => m.tenantId === ctxB.tenantId)).toBe(true);
    expect(members.some((m) => m.tenantId === ctxA.tenantId)).toBe(false);
  });

  it("RLS isolation policy exists for tenant_users in pg_policies", async () => {
    const result = await sql<{ policyname: string }[]>`
      SELECT policyname
      FROM pg_policies
      WHERE tablename = 'tenant_users' AND schemaname = 'public'
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.policyname.includes("tenant"))).toBe(true);
  });
});
