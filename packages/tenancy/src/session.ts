import { db } from "@marketing/db";
import { sessions, tenantUsers } from "@marketing/db";
import { and, eq } from "drizzle-orm";
import type { TenantContext } from "./context";

// TenantContext is NEVER constructed from URL params or request body.
// Always derived from the session row. See MULTI_TENANCY.md §Tenant context propagation.
export async function buildTenantContext(
  sessionToken: string,
): Promise<TenantContext | null> {
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, sessionToken));

  if (!session || session.expiresAt < now) {
    return null;
  }

  if (!session.activeTenantId) {
    return null;
  }

  const [membership] = await db
    .select()
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, session.activeTenantId),
        eq(tenantUsers.userId, session.userId),
      ),
    );

  if (!membership) {
    return null;
  }

  return {
    tenantId: session.activeTenantId,
    userId: session.userId,
    role: membership.role,
  };
}

export async function setActiveTenant(
  sessionToken: string,
  tenantId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ activeTenantId: tenantId, updatedAt: new Date() })
    .where(eq(sessions.token, sessionToken));
}
