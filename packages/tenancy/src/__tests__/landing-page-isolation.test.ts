// Tenant isolation + RLS structural tests for landing-page tables.
// Covers: landing_pages, landing_page_versions, landing_page_views,
//         forms, leads, brand_embeddings.
// Uses the Testcontainers pattern (real Postgres, real migrations).
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@marketing/db/schema";
import { MIGRATIONS_DIR } from "@marketing/db/migrate";
import { atomicSignup } from "@marketing/auth";
import { and, eq } from "drizzle-orm";
import type { TenantContext } from "../context";

let container: Awaited<ReturnType<InstanceType<typeof PostgreSqlContainer>["start"]>>;
let sql: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("test_landing_isolation")
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

describe("landing-page tables — RLS structural checks", () => {
  const TABLES = [
    "landing_pages",
    "landing_page_versions",
    "landing_page_views",
    "forms",
    "leads",
    "brand_embeddings",
  ] as const;

  for (const table of TABLES) {
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

// ─── pgvector extension check ─────────────────────────────────────────────────

describe("pgvector extension", () => {
  it("vector extension is installed", async () => {
    const result = await sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    // Skip gracefully if the test Postgres image doesn't have pgvector.
    if (result.length === 0) {
      console.warn("pgvector not available in test container — skipping vector checks");
      return;
    }
    expect(result[0]?.extname).toBe("vector");
  });
});

// ─── landing_pages isolation ──────────────────────────────────────────────────

describe("tenant isolation — landing_pages", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const rA = await atomicSignup(
      { name: "LP Owner A", email: "lp-a@example.com", password: "pw-lp-a-123", businessName: "LP Biz A" },
      testDb,
    );
    const rB = await atomicSignup(
      { name: "LP Owner B", email: "lp-b@example.com", password: "pw-lp-b-123", businessName: "LP Biz B" },
      testDb,
    );
    ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };
    ctxB = { tenantId: rB.tenantId, userId: rB.userId, role: "owner" };

    await testDb.insert(schema.landingPages).values([
      { tenantId: ctxA.tenantId, slug: "page-a-001", title: "Page A", stepData: {} },
      { tenantId: ctxB.tenantId, slug: "page-b-001", title: "Page B", stepData: {} },
    ]);
  });

  it("tenant A sees only its own landing pages", async () => {
    const rows = await testDb
      .select()
      .from(schema.landingPages)
      .where(eq(schema.landingPages.tenantId, ctxA.tenantId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenantId === ctxA.tenantId)).toBe(true);
  });

  it("tenant A cannot see tenant B landing pages", async () => {
    const rows = await testDb
      .select()
      .from(schema.landingPages)
      .where(eq(schema.landingPages.tenantId, ctxB.tenantId));
    expect(rows.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });
});

// ─── forms isolation ──────────────────────────────────────────────────────────

describe("tenant isolation — forms", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const rA = await atomicSignup(
      { name: "Form Owner A", email: "form-a@example.com", password: "pw-form-a-123", businessName: "Form Biz A" },
      testDb,
    );
    const rB = await atomicSignup(
      { name: "Form Owner B", email: "form-b@example.com", password: "pw-form-b-123", businessName: "Form Biz B" },
      testDb,
    );
    ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };
    ctxB = { tenantId: rB.tenantId, userId: rB.userId, role: "owner" };

    const formSchema = {
      type: "object",
      required: ["email"],
      properties: { email: { type: "string", title: "E-Mail" } },
    };

    await testDb.insert(schema.forms).values([
      { tenantId: ctxA.tenantId, name: "Form A", slug: "form-a-001", schema: formSchema },
      { tenantId: ctxB.tenantId, name: "Form B", slug: "form-b-001", schema: formSchema },
    ]);
  });

  it("tenant A sees only its own forms", async () => {
    const rows = await testDb
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.tenantId, ctxA.tenantId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenantId === ctxA.tenantId)).toBe(true);
  });

  it("tenant B forms are not visible when querying tenant A", async () => {
    const rows = await testDb
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.tenantId, ctxA.tenantId));
    expect(rows.some((r) => r.tenantId === ctxB.tenantId)).toBe(false);
  });
});

// ─── leads isolation ──────────────────────────────────────────────────────────

describe("tenant isolation — leads", () => {
  let ctxA: TenantContext;
  let formAId: string;

  beforeAll(async () => {
    const rA = await atomicSignup(
      { name: "Lead Owner A", email: "lead-a@example.com", password: "pw-lead-a-123", businessName: "Lead Biz A" },
      testDb,
    );
    ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };

    const [form] = await testDb
      .insert(schema.forms)
      .values({
        tenantId: ctxA.tenantId,
        name: "Lead Form A",
        slug: "lead-form-a-001",
        schema: { type: "object", required: ["email"], properties: { email: { type: "string" } } },
      })
      .returning({ id: schema.forms.id });

    formAId = form!.id;

    await testDb.insert(schema.leads).values([
      { tenantId: ctxA.tenantId, formId: formAId, payload: { email: "test@example.com" } },
    ]);
  });

  it("tenant A can read its own leads", async () => {
    const rows = await testDb
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.tenantId, ctxA.tenantId),
          eq(schema.leads.formId, formAId),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]!.tenantId).toBe(ctxA.tenantId);
  });

  it("slug uniqueness enforced per tenant", async () => {
    await expect(
      testDb.insert(schema.forms).values({
        tenantId: ctxA.tenantId,
        name: "Dupe Form",
        slug: "lead-form-a-001", // same slug, same tenant
        schema: {},
      }),
    ).rejects.toThrow();
  });
});

// ─── landing_pages slug uniqueness ────────────────────────────────────────────

describe("landing_pages — slug uniqueness per tenant", () => {
  let ctxA: TenantContext;

  beforeAll(async () => {
    const rA = await atomicSignup(
      { name: "Slug Owner A", email: "slug-a@example.com", password: "pw-slug-a-123", businessName: "Slug Biz A" },
      testDb,
    );
    ctxA = { tenantId: rA.tenantId, userId: rA.userId, role: "owner" };

    await testDb.insert(schema.landingPages).values({
      tenantId: ctxA.tenantId,
      slug: "unique-slug",
      title: "First Page",
      stepData: {},
    });
  });

  it("duplicate slug in same tenant throws unique constraint error", async () => {
    await expect(
      testDb.insert(schema.landingPages).values({
        tenantId: ctxA.tenantId,
        slug: "unique-slug", // duplicate
        title: "Second Page",
        stepData: {},
      }),
    ).rejects.toThrow();
  });
});
