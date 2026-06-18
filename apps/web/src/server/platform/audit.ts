import { db, platformAuditLogs } from "@marketing/db";
import type { PlatformRole } from "@marketing/db";

export async function writePlatformAuditLog(input: {
  actorId: string;
  actorPlatformRole: PlatformRole | null | undefined;
  tenantId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: "success" | "failure";
  metadata?: Record<string, unknown>;
}) {
  await db.insert(platformAuditLogs).values({
    actorId: input.actorId,
    actorPlatformRole: input.actorPlatformRole ?? null,
    tenantId: input.tenantId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome ?? "success",
    metadata: input.metadata ?? {},
  });
}
