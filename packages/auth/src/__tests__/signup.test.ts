import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @marketing/db/schema exports only schema tables — no singleton DB client init.
// @marketing/db/migrate exports MIGRATIONS_DIR without importing the client.
import * as schema from "@marketing/db/schema";
import { MIGRATIONS_DIR } from "@marketing/db/migrate";
import { atomicSignup } from "../signup";

// ─── Container lifecycle ──────────────────────────────────────────────────────

let container: Awaited<ReturnType<InstanceType<typeof PostgreSqlContainer>["start"]>>;
let sql: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("test_marketing")
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("atomicSignup", () => {
  it("creates user + account + tenant + tenant_users atomically", async () => {
    const result = await atomicSignup(
      {
        name: "Alice Müller",
        email: "alice@example.com",
        password: "secure-password-123",
        businessName: "Café Züri",
        locale: "de-CH",
      },
      testDb,
    );

    expect(result.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.tenantId).toBeDefined();
    expect(result.email).toBe("alice@example.com");

    // User row must exist.
    const [user] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, result.userId));
    expect(user?.email).toBe("alice@example.com");
    expect(user?.locale).toBe("de-CH");

    // Credential account row must exist.
    const [account] = await testDb
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, result.userId));
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy(); // argon2id hash

    // Tenant row must exist.
    const [tenant] = await testDb
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, result.tenantId));
    expect(tenant?.name).toBe("Café Züri");
    expect(tenant?.plan).toBe("trial");

    // Owner membership must exist.
    const [membership] = await testDb
      .select()
      .from(schema.tenantUsers)
      .where(eq(schema.tenantUsers.userId, result.userId));
    expect(membership?.tenantId).toBe(result.tenantId);
    expect(membership?.role).toBe("owner");

    // Both outbox events must exist within the same transaction.
    const events = await testDb
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.tenantId, result.tenantId));
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("user.signed_up");
    expect(eventTypes).toContain("tenant.created");
  });

  it("rejects duplicate email and leaves no partial state", async () => {
    await atomicSignup(
      {
        name: "Bob",
        email: "bob@example.com",
        password: "another-password-456",
        businessName: "Bob's Bistro",
      },
      testDb,
    );

    // Second signup with the same email must throw.
    await expect(
      atomicSignup(
        {
          name: "Bob2",
          email: "bob@example.com",
          password: "different-password-789",
          businessName: "Bob's Bistro 2",
        },
        testDb,
      ),
    ).rejects.toThrow();

    // Only one user with bob@example.com.
    const users = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "bob@example.com"));
    expect(users).toHaveLength(1);
  });
});
