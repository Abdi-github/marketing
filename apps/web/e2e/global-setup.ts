/**
 * Playwright globalSetup — seeds the test DB once before all specs run.
 *
 * Intentionally avoids dynamic imports of workspace TypeScript packages.
 * Playwright's Node.js process can't resolve named ESM exports from packages
 * that lack "type": "module", causing interop errors in the import chain.
 *
 * Instead:
 *   - signup uses fetch (the webServer is started before globalSetup runs)
 *   - plan/platformRole mutations use raw postgres.js (plain JS, no TS chain)
 */
import postgres from "postgres";

const BASE_URL = "http://localhost:3000";

export const E2E_USERS = {
  cafeOwner: {
    email: "cafe-owner@e2e.test",
    password: "E2eTestPass1!",
    name: "Cafe Owner E2E",
    businessName: "Zurich Cafe E2E",
    locale: "de-CH",
  },
  restaurantOwner: {
    email: "restaurant-owner@e2e.test",
    password: "E2eTestPass1!",
    name: "Restaurant Owner E2E",
    businessName: "Geneva Restaurant E2E",
    locale: "fr-CH",
  },
  superAdmin: {
    email: "super-admin@e2e.test",
    password: "E2eTestPass1!",
    name: "Platform Admin E2E",
    businessName: "Platform Admin E2E",
    locale: "de-CH",
  },
} as const;

type UserIds = { userId: string; tenantId: string };

async function signupViaAPI(
  user: (typeof E2E_USERS)[keyof typeof E2E_USERS]
): Promise<UserIds | null> {
  // tRPC v11 with httpBatchLink and NO transformer: raw input, no {json:...} wrapper.
  // Non-batch POST — body is the plain input object.
  const res = await fetch(`${BASE_URL}/api/trpc/auth.signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: user.name,
      email: user.email,
      password: user.password,
      businessName: user.businessName,
      locale: user.locale,
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await res.json()) as any;
  const result = body?.result?.data as UserIds | undefined;
  if (result?.userId) return result;
  // CONFLICT → user already seeded in a prior run
  if (body?.error?.data?.code === "CONFLICT") return null;
  throw new Error(
    `Signup failed for ${user.email}: status=${res.status} body=${JSON.stringify(body?.error ?? body)}`
  );
}

export default async function globalSetup() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/marketing_test";

  const sql = postgres(databaseUrl);

  const seed = async (
    key: keyof typeof E2E_USERS
  ): Promise<UserIds> => {
    const user = E2E_USERS[key];
    const apiResult = await signupViaAPI(user);

    if (apiResult) return apiResult;

    // User already exists — look up IDs from DB
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${user.email}
    `;
    if (!row) throw new Error(`User ${user.email} expected but not found in DB`);
    const [membership] = await sql<{ tenant_id: string }[]>`
      SELECT tenant_id FROM tenant_users WHERE user_id = ${row.id} LIMIT 1
    `;
    return { userId: row.id, tenantId: membership?.tenant_id ?? "" };
  };

  // cafeOwner → ensure tenant is not suspended from a prior test run
  const { tenantId: cafeTenantId } = await seed("cafeOwner");
  if (cafeTenantId) {
    await sql`UPDATE tenants SET suspended = false WHERE id = ${cafeTenantId}`;
    // Seed a business profile so generateSocialPost / draftFromPrompt work.
    await sql`
      INSERT INTO business_profiles (tenant_id, vertical, business_name, locale, address_city)
      VALUES (${cafeTenantId}, 'cafe', 'Zurich Cafe E2E', 'de-CH', 'Zurich')
      ON CONFLICT (tenant_id) DO NOTHING
    `;
  }

  // restaurantOwner → upgrade plan to starter for billing tests
  const { tenantId: restaurantTenantId } = await seed("restaurantOwner");
  if (restaurantTenantId) {
    await sql`UPDATE tenants SET plan = 'starter' WHERE id = ${restaurantTenantId}`;
  }

  // superAdmin → set platform_role for ops tests
  const { userId: superAdminId } = await seed("superAdmin");
  if (superAdminId) {
    await sql`UPDATE users SET platform_role = 'super_admin' WHERE id = ${superAdminId}`;
  }

  await sql.end();

  // Pre-warm Turbopack: visit all routes that tests use so compilation
  // happens before tests start rather than blocking individual test timers.
  const routes = [
    "/de/signup",
    "/de/ops",
    "/de/billing",
    "/de/integrations",
    "/de/landing-pages",
    "/de/dashboard/posts/new",
    "/api/trpc/auth.signup",
  ];
  console.log("[e2e] pre-warming routes…");
  for (const route of routes) {
    try {
      await fetch(`${BASE_URL}${route}`);
    } catch {
      // ignore — we only need compilation to trigger, not a successful response
    }
  }

  console.log("[e2e] globalSetup complete — test users seeded and routes warmed");
}
