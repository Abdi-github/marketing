// Tenant isolation tests for ai_usage and social_posts.
// Uses the same testcontainers pattern as isolation.test.ts.
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
    .withDatabase("test_content_isolation")
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertAiUsage(
  ctx: TenantContext,
  jobId: string,
  db: typeof testDb,
) {
  const [row] = await db
    .insert(schema.aiUsage)
    .values({
      tenantId: ctx.tenantId,
      jobId,
      provider: "echo",
      model: "echo-1",
      promptId: "social-post-v1",
      promptVersion: 1,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: "0.000010",
    })
    .returning();
  return row!;
}

async function insertSocialPost(
  ctx: TenantContext,
  jobId: string,
  db: typeof testDb,
) {
  const [row] = await db
    .insert(schema.socialPosts)
    .values({
      tenantId: ctx.tenantId,
      jobId,
      promptInput: { topic: "Test", vertical: "restaurant" },
      status: "completed",
      generatedText: "Schöner Post für " + ctx.tenantId,
    })
    .returning();
  return row!;
}

async function getAiUsageForTenant(ctx: TenantContext, db: typeof testDb) {
  return db
    .select()
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.tenantId, ctx.tenantId));
}

async function getSocialPostsForTenant(ctx: TenantContext, db: typeof testDb) {
  return db
    .select()
    .from(schema.socialPosts)
    .where(eq(schema.socialPosts.tenantId, ctx.tenantId));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("tenant isolation — ai_usage", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const resultA = await atomicSignup(
      { name: "AI Owner A", email: "ai-owner-a@example.com", password: "pw-a-content-123", businessName: "Content Biz A" },
      testDb,
    );
    const resultB = await atomicSignup(
      { name: "AI Owner B", email: "ai-owner-b@example.com", password: "pw-b-content-123", businessName: "Content Biz B" },
      testDb,
    );
    ctxA = { tenantId: resultA.tenantId, userId: resultA.userId, role: "owner" };
    ctxB = { tenantId: resultB.tenantId, userId: resultB.userId, role: "owner" };

    await insertAiUsage(ctxA, "00000000-0000-0000-0001-000000000001", testDb);
    await insertAiUsage(ctxB, "00000000-0000-0000-0002-000000000001", testDb);
  });

  it("tenant A sees only its own ai_usage rows", async () => {
    const rows = await getAiUsageForTenant(ctxA, testDb);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === ctxA.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === ctxB.tenantId)).toBe(false);
  });

  it("tenant B sees only its own ai_usage rows", async () => {
    const rows = await getAiUsageForTenant(ctxB, testDb);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === ctxB.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === ctxA.tenantId)).toBe(false);
  });

  it("RLS is enabled on ai_usage", async () => {
    const result = await sql<{ rowsecurity: boolean }[]>`
      SELECT rowsecurity FROM pg_tables
      WHERE tablename = 'ai_usage' AND schemaname = 'public'
    `;
    expect(result[0]?.rowsecurity).toBe(true);
  });

  it("ai_usage tenant isolation policy exists in pg_policies", async () => {
    const result = await sql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'ai_usage' AND schemaname = 'public'
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.policyname.includes("tenant"))).toBe(true);
  });
});

describe("tenant isolation — social_posts", () => {
  let ctxA: TenantContext;
  let ctxB: TenantContext;

  beforeAll(async () => {
    const resultA = await atomicSignup(
      { name: "Post Owner A", email: "post-owner-a@example.com", password: "pw-a-posts-123", businessName: "Posts Biz A" },
      testDb,
    );
    const resultB = await atomicSignup(
      { name: "Post Owner B", email: "post-owner-b@example.com", password: "pw-b-posts-123", businessName: "Posts Biz B" },
      testDb,
    );
    ctxA = { tenantId: resultA.tenantId, userId: resultA.userId, role: "owner" };
    ctxB = { tenantId: resultB.tenantId, userId: resultB.userId, role: "owner" };

    await insertSocialPost(ctxA, "00000000-0000-0000-0001-000000000002", testDb);
    await insertSocialPost(ctxB, "00000000-0000-0000-0002-000000000002", testDb);
  });

  it("tenant A sees only its own social_posts", async () => {
    const posts = await getSocialPostsForTenant(ctxA, testDb);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.tenantId === ctxA.tenantId)).toBe(true);
    expect(posts.some((p) => p.tenantId === ctxB.tenantId)).toBe(false);
  });

  it("tenant B sees only its own social_posts", async () => {
    const posts = await getSocialPostsForTenant(ctxB, testDb);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.tenantId === ctxB.tenantId)).toBe(true);
    expect(posts.some((p) => p.tenantId === ctxA.tenantId)).toBe(false);
  });

  it("RLS is enabled on social_posts", async () => {
    const result = await sql<{ rowsecurity: boolean }[]>`
      SELECT rowsecurity FROM pg_tables
      WHERE tablename = 'social_posts' AND schemaname = 'public'
    `;
    expect(result[0]?.rowsecurity).toBe(true);
  });

  it("social_posts tenant isolation policy exists in pg_policies", async () => {
    const result = await sql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'social_posts' AND schemaname = 'public'
    `;
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.policyname.includes("tenant"))).toBe(true);
  });
});
