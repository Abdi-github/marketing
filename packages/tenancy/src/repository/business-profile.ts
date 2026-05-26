import { db as defaultDb, type Database } from "@marketing/db";
import { businessProfiles } from "@marketing/db";
import type { BusinessProfile, NewBusinessProfile } from "@marketing/db";
import { eq } from "drizzle-orm";
import type { TenantContext } from "../context";

// add-tenant-table: every function takes TenantContext first, filters by tenantId.

export async function getBusinessProfile(
  ctx: TenantContext,
  dbOverride?: Database,
): Promise<BusinessProfile | null> {
  const client = dbOverride ?? defaultDb;
  const rows = await client
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, ctx.tenantId));
  return rows[0] ?? null;
}

export async function createBusinessProfile(
  ctx: TenantContext,
  input: Omit<NewBusinessProfile, "tenantId">,
  dbOverride?: Database,
): Promise<BusinessProfile> {
  const client = dbOverride ?? defaultDb;
  const rows = await client
    .insert(businessProfiles)
    .values({ ...input, tenantId: ctx.tenantId })
    .returning();
  return rows[0]!;
}

export async function updateBusinessProfile(
  ctx: TenantContext,
  input: Partial<Omit<NewBusinessProfile, "tenantId" | "id">>,
  dbOverride?: Database,
): Promise<BusinessProfile | null> {
  const client = dbOverride ?? defaultDb;
  const rows = await client
    .update(businessProfiles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(businessProfiles.tenantId, ctx.tenantId))
    .returning();
  return rows[0] ?? null;
}
