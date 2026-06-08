// One-shot script — updates plan/role/profile for the three seeded E2E users.
// Run: DATABASE_URL=... pnpm --filter @marketing/db tsx packages/db/scripts/patch-e2e-seed.ts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/marketing_dev");

const restaurantTenantId = "44b2c506-0f41-4693-ac38-e0c613b2f554";
const superAdminUserId    = "7b90a73c-020b-4cd2-9d68-c310ec6a9cbc";
const cafeTenantId        = "7b97f98c-f9ad-440c-92bd-f6ee184f48de";

await sql`UPDATE tenants SET plan = 'starter' WHERE id = ${restaurantTenantId}`;
console.log("✓ restaurant-owner plan → starter");

await sql`UPDATE users SET platform_role = 'super_admin' WHERE id = ${superAdminUserId}`;
console.log("✓ super-admin platform_role → super_admin");

await sql`
  INSERT INTO business_profiles (tenant_id, vertical, business_name, locale, address_city)
  VALUES (${cafeTenantId}, 'cafe', 'Zurich Cafe E2E', 'de-CH', 'Zurich')
  ON CONFLICT (tenant_id) DO NOTHING
`;
console.log("✓ cafe-owner business_profile seeded");

await sql.end();
