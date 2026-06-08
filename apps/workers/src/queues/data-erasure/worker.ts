// FADP Art. 17 hard-delete worker.
// Anonymizes PII; retains invoices + ai_usage for billing audit trail.
// Runs as a separate low-priority BullMQ job — never in an HTTP request.
import {
  type DataErasureJob,
  dataErasureJobSchema,
  DATA_ERASURE_QUEUE_NAME,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  tenants,
  users,
  businessProfiles,
  socialPosts,
  landingPages,
  leads,
  tenantUsers,
} from "@marketing/db";
import { logger, recordMetric, hashId } from "@marketing/shared";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { connection } from "./queue";

// ─── Job handler ──────────────────────────────────────────────────────────────

export async function handleDataErasureJob(job: Job<DataErasureJob>): Promise<void> {
  const data = dataErasureJobSchema.parse(job.data);
  const { tenantId } = data;

  // Idempotent: skip if already erased.
  const [tenant] = await db
    .select({ erasedAt: tenants.erasedAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (tenant?.erasedAt) {
    logger.info({ tenantId }, "[data-erasure] already erased — skipping");
    return;
  }

  logger.info({ tenantId }, "[data-erasure] starting FADP erasure");

  // 1. Delete content rows (no billing / audit retention requirement).
  await db.delete(socialPosts).where(eq(socialPosts.tenantId, tenantId));
  await db.delete(landingPages).where(eq(landingPages.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId));

  // 2. Anonymize business_profile (tenant-scoped — safe to clear).
  await db
    .update(businessProfiles)
    .set({ businessName: "DELETED", addressStreet: null, addressCity: null, addressPostalCode: null })
    .where(eq(businessProfiles.tenantId, tenantId));

  // 3. Anonymize user PII for users that are members of this tenant.
  //    MVP assumption: CH SME users belong to one tenant. Multi-tenant users
  //    are anonymized too — the FADP erasure request covers the entire user record.
  const members = await db
    .select({ userId: tenantUsers.userId })
    .from(tenantUsers)
    .where(eq(tenantUsers.tenantId, tenantId));

  for (const member of members) {
    const ghost = randomUUID();
    await db
      .update(users)
      .set({ name: "DELETED", email: `${ghost}@deleted.invalid`, deletedAt: new Date() })
      .where(eq(users.id, member.userId));
  }

  // 4. Mark tenants.erased_at — keeps the shell for billing audit trail.
  //    invoices + ai_usage rows are intentionally retained (FADP Art. 17 exemption).
  await db
    .update(tenants)
    .set({ erasedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  logger.info({ tenantId }, "[data-erasure] FADP erasure complete");
  recordMetric("tenant.data_erasure.completed", { tenantIdHash: hashId(tenantId) });
}

// ─── BullMQ Worker registration ───────────────────────────────────────────────

export const dataErasureWorker = new Worker<DataErasureJob>(
  DATA_ERASURE_QUEUE_NAME,
  handleDataErasureJob,
  {
    connection,
    concurrency: 1,
  },
);

dataErasureWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[data-erasure] BullMQ job completed");
});

dataErasureWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[data-erasure] BullMQ job failed");
});
