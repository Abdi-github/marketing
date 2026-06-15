import {
  domainCertJobSchema,
  DOMAIN_CERT_QUEUE_NAME,
  type DomainCertJob,
  type DomainCertProvisionJob,
} from "@marketing/ai-router";
import { customDomains, db } from "@marketing/db";
import { hashId, logger, recordMetric } from "@marketing/shared";
import type { Job } from "bullmq";
import { UnrecoverableError, Worker } from "bullmq";
import { and, eq, lte } from "drizzle-orm";
import { createDomainCertProvider } from "./provider";
import { connection, domainCertQueue } from "./queue";
import { addDays, buildDomainCertRenewalJob, daysUntil, shouldAlertExpiringSoon } from "./renewal";

const RENEWAL_SCAN_CRON = "0 3 * * *";
const RENEWAL_WINDOW_DAYS = 30;

function fallbackExpiry(from = new Date()): Date {
  return new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);
}

async function handleProvisionJob(data: DomainCertProvisionJob): Promise<void> {
  const [domain] = await db
    .select({
      id: customDomains.id,
      tenantId: customDomains.tenantId,
      hostname: customDomains.hostname,
      status: customDomains.status,
      certExpiresAt: customDomains.certExpiresAt,
    })
    .from(customDomains)
    .where(and(eq(customDomains.id, data.domainId), eq(customDomains.tenantId, data.tenantId)));

  if (!domain) {
    throw new UnrecoverableError("Custom domain not found");
  }
  if (domain.hostname !== data.hostname) {
    throw new UnrecoverableError("Custom domain hostname changed before certificate provisioning");
  }
  if (domain.status === "removed") {
    throw new UnrecoverableError("Custom domain was removed");
  }
  if (domain.status === "live" && data.action === "issue") {
    logger.info({ domainId: data.domainId, hostname: data.hostname }, "[domain-cert] already live");
    return;
  }

  if (data.action === "issue") {
    await db
      .update(customDomains)
      .set({ status: "cert_pending", lastDnsCheckError: null, updatedAt: new Date() })
      .where(and(eq(customDomains.id, data.domainId), eq(customDomains.tenantId, data.tenantId)));
  } else {
    await db
      .update(customDomains)
      .set({ lastDnsCheckError: null, updatedAt: new Date() })
      .where(and(eq(customDomains.id, data.domainId), eq(customDomains.tenantId, data.tenantId)));
  }

  try {
    const provider = createDomainCertProvider();
    const result = await provider.provision({
      domainId: data.domainId,
      tenantId: data.tenantId,
      hostname: data.hostname,
      action: data.action,
    });
    const issuedAt = result.issuedAt ?? new Date();
    const expiresAt = result.expiresAt ?? fallbackExpiry(issuedAt);

    await db
      .update(customDomains)
      .set({
        status: "live",
        certIssuedAt: issuedAt,
        certExpiresAt: expiresAt,
        lastDnsCheckError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(customDomains.id, data.domainId), eq(customDomains.tenantId, data.tenantId)));

    logger.info(
      {
        domainId: data.domainId,
        hostname: data.hostname,
        tenantId: data.tenantId,
        action: data.action,
      },
      "[domain-cert] provisioned",
    );
    recordMetric("domain.cert.provisioned", {
      action: data.action,
      tenantIdHash: hashId(data.tenantId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const certAlreadyExpired =
      data.action === "renew" &&
      domain.certExpiresAt !== null &&
      domain.certExpiresAt.getTime() <= Date.now();

    await db
      .update(customDomains)
      .set({
        status: data.action === "issue" || certAlreadyExpired ? "failed" : "live",
        lastDnsCheckError: message,
        updatedAt: new Date(),
      })
      .where(and(eq(customDomains.id, data.domainId), eq(customDomains.tenantId, data.tenantId)));

    logger.error(
      {
        domainId: data.domainId,
        hostname: data.hostname,
        tenantId: data.tenantId,
        action: data.action,
        err: message,
      },
      "[domain-cert] failed",
    );
    recordMetric("domain.cert.failed", {
      action: data.action,
      tenantIdHash: hashId(data.tenantId),
    });
    throw err;
  }
}

export async function handleDomainCertRenewalScan(now = new Date()): Promise<{
  scanned: number;
  enqueued: number;
  expiringSoon: number;
}> {
  const renewalCutoff = addDays(now, RENEWAL_WINDOW_DAYS);
  const rows = await db
    .select({
      id: customDomains.id,
      tenantId: customDomains.tenantId,
      hostname: customDomains.hostname,
      certExpiresAt: customDomains.certExpiresAt,
    })
    .from(customDomains)
    .where(and(eq(customDomains.status, "live"), lte(customDomains.certExpiresAt, renewalCutoff)));

  let enqueued = 0;
  let expiringSoon = 0;

  for (const row of rows) {
    if (!row.certExpiresAt) continue;

    if (shouldAlertExpiringSoon(row.certExpiresAt, now)) {
      expiringSoon += 1;
      recordMetric("domain.cert.expiring_soon", {
        tenantIdHash: hashId(row.tenantId),
        daysUntilExpiry: String(daysUntil(row.certExpiresAt, now)),
      });
    }

    const renewalJob = buildDomainCertRenewalJob({
      domainId: row.id,
      tenantId: row.tenantId,
      hostname: row.hostname,
      certExpiresAt: row.certExpiresAt,
    });

    try {
      await domainCertQueue.add("domain-cert:renew", renewalJob, {
        jobId: renewalJob.idempotencyKey,
      });
      enqueued += 1;
    } catch (err) {
      logger.error(
        {
          domainId: row.id,
          hostname: row.hostname,
          tenantId: row.tenantId,
          err: err instanceof Error ? err.message : String(err),
        },
        "[domain-cert] failed to enqueue renewal",
      );
      recordMetric("domain.cert.renewal_enqueue_failed", {
        tenantIdHash: hashId(row.tenantId),
      });
    }
  }

  logger.info(
    {
      scanned: rows.length,
      enqueued,
      expiringSoon,
      renewalWindowDays: RENEWAL_WINDOW_DAYS,
    },
    "[domain-cert] renewal scan completed",
  );

  return { scanned: rows.length, enqueued, expiringSoon };
}

export async function handleDomainCertJob(job: Job<DomainCertJob>): Promise<void> {
  const data = domainCertJobSchema.parse(job.data);

  if (data.action === "scan-renewals") {
    await handleDomainCertRenewalScan();
    return;
  }

  await handleProvisionJob(data);
}

export const domainCertWorker = new Worker<DomainCertJob>(
  DOMAIN_CERT_QUEUE_NAME,
  handleDomainCertJob,
  {
    connection,
    concurrency: 2,
  },
);

domainCertWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[domain-cert] BullMQ job completed");
  recordMetric("queue.job.completed", { queue: DOMAIN_CERT_QUEUE_NAME, jobId: job.id });
});

domainCertWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[domain-cert] BullMQ job failed");
  recordMetric("queue.job.failed", {
    queue: DOMAIN_CERT_QUEUE_NAME,
    jobId: job?.id,
    err: err.message,
  });
});

domainCertQueue
  .add(
    "domain-cert:scan-renewals",
    {
      action: "scan-renewals",
      idempotencyKey: "domain-cert:scan-renewals",
    },
    {
      repeat: { pattern: RENEWAL_SCAN_CRON },
      jobId: "domain-cert-scan-renewals-cron",
    },
  )
  .then(() => {
    logger.info({ cron: RENEWAL_SCAN_CRON }, "[domain-cert] renewal scan scheduled");
  })
  .catch((err) => {
    logger.error({ err: String(err) }, "[domain-cert] failed to schedule renewal scan");
  });
