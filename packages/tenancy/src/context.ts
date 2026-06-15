import type { TenantRole } from "@marketing/db";

// TenantContext is constructed from the session only — never from URL params or
// request body. See docs/MULTI_TENANCY.md §Tenant context propagation.
export type TenantContext = {
  tenantId: string;
  userId: string;
  role: TenantRole;
};

// Role hierarchy: owner ⊇ admin ⊇ editor ⊇ viewer for read.
const ROLE_RANK: Record<TenantRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

export function hasRole(ctx: TenantContext, minimum: TenantRole): boolean {
  return (ROLE_RANK[ctx.role] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}

export function assertRole(ctx: TenantContext, minimum: TenantRole): void {
  if (!hasRole(ctx, minimum)) {
    throw new Error(`Forbidden: requires ${minimum}, got ${ctx.role}`);
  }
}
