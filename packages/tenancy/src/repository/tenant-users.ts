import { db as defaultDb, type Database } from "@marketing/db";
import { tenantUsers } from "@marketing/db";
import type { NewTenantUser, TenantUser } from "@marketing/db";
import { and, eq } from "drizzle-orm";
import type { TenantContext } from "../context";

// add-tenant-table: every function takes TenantContext first, filters by tenantId.

export async function listTenantUsers(
  ctx: TenantContext,
  dbOverride?: Database,
): Promise<TenantUser[]> {
  const client = dbOverride ?? defaultDb;
  return client
    .select()
    .from(tenantUsers)
    .where(eq(tenantUsers.tenantId, ctx.tenantId));
}

export async function getTenantUser(
  ctx: TenantContext,
  userId: string,
  dbOverride?: Database,
): Promise<TenantUser | null> {
  const client = dbOverride ?? defaultDb;
  const rows = await client
    .select()
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, ctx.tenantId),
        eq(tenantUsers.userId, userId),
      ),
    );
  return rows[0] ?? null;
}

export async function createTenantUser(
  ctx: TenantContext,
  input: Omit<NewTenantUser, "tenantId">,
  dbOverride?: Database,
): Promise<TenantUser> {
  const client = dbOverride ?? defaultDb;
  const rows = await client
    .insert(tenantUsers)
    .values({ ...input, tenantId: ctx.tenantId })
    .returning();
  return rows[0]!;
}

export async function deleteTenantUser(
  ctx: TenantContext,
  userId: string,
  dbOverride?: Database,
): Promise<void> {
  const client = dbOverride ?? defaultDb;
  await client
    .delete(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, ctx.tenantId),
        eq(tenantUsers.userId, userId),
      ),
    );
}
