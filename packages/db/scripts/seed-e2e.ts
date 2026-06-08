#!/usr/bin/env tsx
/**
 * Standalone seed script for manual e2e DB reset.
 * Usage: DATABASE_URL=postgres://... tsx packages/db/scripts/seed-e2e.ts
 *
 * This is NOT the Playwright globalSetup — that lives at
 * apps/web/e2e/global-setup.ts and runs automatically before each e2e suite.
 * This script is for ad-hoc resets during local development.
 */
import { db } from "../src";
import { users, tenants, tenantUsers, accounts, sessions, outboxEvents } from "../src/schema";
import { atomicSignup } from "../../packages/auth/src/signup";
import { eq } from "drizzle-orm";

const E2E_USERS = [
  {
    email: "cafe-owner@e2e.test",
    password: "E2eTestPass1!",
    name: "Cafe Owner E2E",
    businessName: "Zurich Cafe E2E",
    locale: "de-CH",
    plan: "trial" as const,
    platformRole: null,
  },
  {
    email: "restaurant-owner@e2e.test",
    password: "E2eTestPass1!",
    name: "Restaurant Owner E2E",
    businessName: "Geneva Restaurant E2E",
    locale: "fr-CH",
    plan: "starter" as const,
    platformRole: null,
  },
  {
    email: "super-admin@e2e.test",
    password: "E2eTestPass1!",
    name: "Platform Admin E2E",
    businessName: "Platform Admin E2E",
    locale: "de-CH",
    plan: "trial" as const,
    platformRole: "super_admin",
  },
] as const;

async function wipeTables() {
  console.log("Wiping e2e test rows…");
  // Delete in dependency order. Only rows belonging to e2e test emails.
  const testEmails = E2E_USERS.map((u) => u.email);
  for (const email of testEmails) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!user) continue;
    const memberships = await db
      .select({ tenantId: tenantUsers.tenantId })
      .from(tenantUsers)
      .where(eq(tenantUsers.userId, user.id));
    for (const { tenantId } of memberships) {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await db.delete(users).where(eq(users.id, user.id));
  }
}

async function main() {
  await wipeTables();

  for (const u of E2E_USERS) {
    const { userId, tenantId } = await atomicSignup({
      name: u.name,
      email: u.email,
      password: u.password,
      businessName: u.businessName,
      locale: u.locale,
    });

    if (u.plan !== "trial") {
      await db.update(tenants).set({ plan: u.plan }).where(eq(tenants.id, tenantId));
    }
    if (u.platformRole) {
      await db
        .update(users)
        .set({ platformRole: u.platformRole })
        .where(eq(users.id, userId));
    }

    console.log(`  ✓ ${u.email} (plan: ${u.plan}, role: ${u.platformRole ?? "user"})`);
  }

  await db.$client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
