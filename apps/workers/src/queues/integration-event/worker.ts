import {
  type IntegrationEventJob,
  type SocialPostJob,
  integrationEventJobSchema,
  INTEGRATION_EVENT_QUEUE_NAME,
  SOCIAL_POST_QUEUE_NAME,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import { webhookEvents, tenants, businessProfiles } from "@marketing/db";
import { logger, recordMetric, hashId } from "@marketing/shared";
import type { Job } from "bullmq";
import { Worker, Queue, UnrecoverableError } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { connection } from "./queue";

// Sentinel UUID used as the system actor for integration-triggered jobs.
// Satisfies z.string().uuid() — no tenant user is involved in fan-out paths.
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000" as const;

// ─── Downstream queue ─────────────────────────────────────────────────────────

let _socialPostQueue: Queue<SocialPostJob> | null = null;

function getSocialPostQueue(): Queue<SocialPostJob> {
  if (!_socialPostQueue) {
    _socialPostQueue = new Queue<SocialPostJob>(SOCIAL_POST_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _socialPostQueue;
}

/** Inject a mock queue in unit tests. */
export function setSocialPostQueueForTest(q: Queue<SocialPostJob>): void {
  _socialPostQueue = q;
}

// ─── Business profile lookup ──────────────────────────────────────────────────

type BusinessContext = {
  businessName: string;
  vertical: "restaurant" | "cafe" | "fitness_studio";
  locale: string;
};

async function getBusinessContext(tenantId: string): Promise<BusinessContext | null> {
  const [profile] = await db
    .select({
      businessName: businessProfiles.businessName,
      vertical: businessProfiles.vertical,
      locale: businessProfiles.locale,
    })
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, tenantId));
  return profile ? (profile as BusinessContext) : null;
}

// ─── Suspended-tenant guard ───────────────────────────────────────────────────

async function isTenantSuspended(tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ suspended: tenants.suspended })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row?.suspended ?? false;
}

// ─── Job handler ──────────────────────────────────────────────────────────────

export async function handleIntegrationEventJob(
  job: Job<IntegrationEventJob>,
): Promise<void> {
  const data = integrationEventJobSchema.parse(job.data);
  const { tenantId, webhookEventId, provider, eventType, payload } = data;

  // Abort without retry if the event was already processed (idempotency).
  const [event] = await db
    .select({ id: webhookEvents.id, processedAt: webhookEvents.processedAt })
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.id, webhookEventId), isNull(webhookEvents.processedAt)),
    );

  if (!event) {
    logger.info({ webhookEventId }, "[integration-event] already processed — skipping");
    return;
  }

  // Abort without retry if the tenant is suspended.
  if (await isTenantSuspended(tenantId)) {
    logger.warn({ tenantId, webhookEventId }, "[integration-event] tenant suspended — aborting");
    throw new UnrecoverableError(`Tenant ${tenantId} is suspended`);
  }

  // Fetch business context — provides validated businessName and correct vertical.
  const biz = await getBusinessContext(tenantId);
  if (!biz) {
    logger.warn({ tenantId, webhookEventId }, "[integration-event] no business profile — skipping fan-out");
    // Still mark as processed to avoid reprocessing a permanently unresolvable event.
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, webhookEventId));
    return;
  }

  const idempotencyKey = `${tenantId}:${webhookEventId}:${eventType}`;
  const p = payload as Record<string, unknown>;

  if (provider === "gastrofix" && eventType === "reservation.created") {
    const guests = p.guestCount ? `${p.guestCount} Gäste` : "";
    const jobData: SocialPostJob = {
      tenantId,
      jobId: randomUUID(),
      userId: SYSTEM_USER_ID,
      businessName: biz.businessName,
      vertical: biz.vertical,
      locale: biz.locale,
      topic: "Neue Reservation",
      highlights: guests,
      idempotencyKey,
      promptId: "social-post-v1",
      promptVersion: 1,
      costBudgetCents: 50,
    };
    await getSocialPostQueue().add("social-post-from-reservation", jobData, {
      jobId: idempotencyKey,
    });
    logger.info({ tenantId, webhookEventId, eventType }, "[integration-event] enqueued social-post from gastrofix reservation");
  } else if (provider === "eversports" && eventType === "booking.created") {
    const activity = typeof p.activityName === "string" ? p.activityName : "";
    const jobData: SocialPostJob = {
      tenantId,
      jobId: randomUUID(),
      userId: SYSTEM_USER_ID,
      businessName: biz.businessName,
      vertical: biz.vertical,
      locale: biz.locale,
      topic: "Neues Kursangebot",
      highlights: activity,
      idempotencyKey,
      promptId: "social-post-v1",
      promptVersion: 1,
      costBudgetCents: 50,
    };
    await getSocialPostQueue().add("social-post-from-booking", jobData, {
      jobId: idempotencyKey,
    });
    logger.info({ tenantId, webhookEventId, eventType }, "[integration-event] enqueued social-post from eversports booking");
  } else {
    logger.debug({ provider, eventType }, "[integration-event] no downstream action for event type");
  }

  // Mark webhook event as processed.
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, webhookEventId));

  recordMetric("integration.event.processed", {
    provider,
    eventType,
    tenantIdHash: hashId(tenantId),
  });
}

// ─── BullMQ Worker registration ───────────────────────────────────────────────

export const integrationEventWorker = new Worker<IntegrationEventJob>(
  INTEGRATION_EVENT_QUEUE_NAME,
  handleIntegrationEventJob,
  {
    connection,
    concurrency: 10,
  },
);

integrationEventWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[integration-event] BullMQ job completed");
  recordMetric("queue.job.completed", { queue: INTEGRATION_EVENT_QUEUE_NAME, jobId: job.id });
});

integrationEventWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[integration-event] BullMQ job failed");
  recordMetric("queue.job.failed", { queue: INTEGRATION_EVENT_QUEUE_NAME, jobId: job?.id, err: err.message });
});
