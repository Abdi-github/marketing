import { db } from "@marketing/db";
import { sessions, tenantUsers } from "@marketing/db";
import { and, eq } from "drizzle-orm";
import type { TenantContext } from "./context";

// TenantContext is NEVER constructed from URL params or request body.
// Always derived from the session row. See MULTI_TENANCY.md §Tenant context propagation.
export async function buildTenantContext(sessionToken: string): Promise<TenantContext | null> {
  const now = new Date();

  const [session] = await db.select().from(sessions).where(eq(sessions.token, sessionToken));

  if (!session || session.expiresAt < now) {
    return null;
  }

  let activeTenantId = session.activeTenantId;

  if (!activeTenantId) {
    // Auto-select the user's first (and usually only) tenant on fresh login.
    // SME users have exactly one tenant; this avoids a mandatory tenant-switch
    // call before any tenant-scoped tRPC procedure can be called.
    const [first] = await db
      .select({ tenantId: tenantUsers.tenantId })
      .from(tenantUsers)
      .where(eq(tenantUsers.userId, session.userId))
      .limit(1);
    if (!first) return null;
    activeTenantId = first.tenantId;
    // Persist so subsequent requests skip this lookup.
    await db
      .update(sessions)
      .set({ activeTenantId, updatedAt: new Date() })
      .where(eq(sessions.token, sessionToken));
  }

  const [membership] = await db
    .select()
    .from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, activeTenantId), eq(tenantUsers.userId, session.userId)));

  if (!membership) {
    return null;
  }

  return {
    tenantId: activeTenantId,
    userId: session.userId,
    role: membership.role,
  };
}

export async function setActiveTenant(sessionToken: string, tenantId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ activeTenantId: tenantId, updatedAt: new Date() })
    .where(eq(sessions.token, sessionToken));
}
