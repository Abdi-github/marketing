import { db as defaultDb, type Database } from "@marketing/db";
import { accounts, users } from "@marketing/db";
import { tenants } from "@marketing/db";
import { tenantUsers } from "@marketing/db";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { emitTenantCreated, emitUserSignedUp } from "./outbox";

export const signupInputSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  businessName: z.string().min(1).max(200),
  // locale optional — defaults to DE-CH beachhead
  locale: z.string().optional().default("de-CH"),
});

export type SignupInput = z.infer<typeof signupInputSchema>;

export type SignupResult = {
  userId: string;
  tenantId: string;
  email: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

async function uniqueSlug(base: string): Promise<string> {
  const candidate = base || "tenant";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${candidate}-${suffix}`;
}

/**
 * Atomically creates user + credential account + tenant + owner membership.
 * Domain events (user.signed_up, tenant.created) are written to outbox in the
 * same transaction — guaranteed delivery once committed.
 *
 * @param dbOverride  Optional DB instance — used in tests against testcontainers.
 */
export async function atomicSignup(
  input: SignupInput,
  dbOverride?: Database,
): Promise<SignupResult> {
  const validated = signupInputSchema.parse(input);
  const client = dbOverride ?? defaultDb;

  // Hash password outside the transaction — argon2id is CPU-bound.
  const passwordHash = await hash(validated.password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const slug = await uniqueSlug(slugify(validated.businessName));
  const now = new Date().toISOString();

  await client.transaction(async (tx) => {
    // 1. Create user row.
    await tx.insert(users).values({
      id: userId,
      name: validated.name,
      email: validated.email,
      emailVerified: false,
      locale: validated.locale,
    });

    // 2. Credential account — Better-Auth reads password from here on login.
    await tx.insert(accounts).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    // 3. Tenant (plan = 'trial').
    await tx.insert(tenants).values({
      id: tenantId,
      name: validated.businessName,
      slug,
      plan: "trial",
      status: "active",
    });

    // 4. Owner membership.
    await tx.insert(tenantUsers).values({
      tenantId,
      userId,
      role: "owner",
    });

    // 5. Domain events — same transaction, guaranteed delivery.
    await emitUserSignedUp(tx, {
      userId,
      email: validated.email,
      name: validated.name,
      tenantId,
      locale: validated.locale,
      occurredAt: now,
    });

    await emitTenantCreated(tx, {
      tenantId,
      tenantName: validated.businessName,
      plan: "trial",
      occurredAt: now,
    });
  });

  return { userId, tenantId, email: validated.email };
}
