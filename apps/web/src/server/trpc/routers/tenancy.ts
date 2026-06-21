import { DATA_ERASURE_QUEUE_NAME } from "@marketing/ai-router";
import type { DataErasureJob } from "@marketing/ai-router";
import {
  getBusinessProfile,
  createBusinessProfile,
  updateBusinessProfile,
} from "@marketing/tenancy";
import { db, tenants } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { requires, router, tenantProcedure } from "../trpc";

// ─── Queue client ─────────────────────────────────────────────────────────────

let _redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!_redis)
    _redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  return _redis;
}

let _queue: Queue<DataErasureJob> | null = null;
function getDataErasureQueue(): Queue<DataErasureJob> {
  if (!_queue) {
    _queue = new Queue(DATA_ERASURE_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _queue;
}

// ─── Router ───────────────────────────────────────────────────────────────────

const businessProfileInput = z.object({
  businessName: z.string().min(1).max(200),
  vertical: z.string().min(2).max(100),
  locale: z.enum(["de-CH", "fr-CH", "it-CH", "en"]),
  addressCity: z.string().max(100).optional(),
  leadCaptureSettings: z
    .object({
      preferredConfirmationChannel: z.enum(["auto", "email", "whatsapp", "sms"]).default("auto"),
      autoAcknowledgementEnabled: z.boolean().optional(),
      aiReplyAssistanceEnabled: z.boolean().optional(),
      reservationConfirmationMessage: z.string().max(500).optional(),
      callbackConfirmationMessage: z.string().max(500).optional(),
      quoteConfirmationMessage: z.string().max(500).optional(),
      genericConfirmationMessage: z.string().max(500).optional(),
    })
    .optional(),
});

export const tenancyRouter = router({
  getBusinessProfile: tenantProcedure.query(async ({ ctx }) => {
    return getBusinessProfile(ctx.tenantCtx);
  }),

  // Returns the tenant slug — used for building public/embed URLs client-side.
  getSlug: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const [row] = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return { slug: row?.slug ?? "" };
  }),

  upsertBusinessProfile: requires("admin")
    .input(businessProfileInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await getBusinessProfile(ctx.tenantCtx);
      if (existing) {
        return updateBusinessProfile(ctx.tenantCtx, input);
      }
      return createBusinessProfile(ctx.tenantCtx, input);
    }),

  // Enqueues an irreversible FADP Art. 17 hard-delete job for the current tenant.
  // Allowed by both owner and admin — they can request erasure of their own tenant.
  requestDataErasure: requires("admin").mutation(async ({ ctx }) => {
    const { tenantId, userId } = ctx.tenantCtx;

    const job = await getDataErasureQueue().add(
      "data-erasure",
      { tenantId, requestedBy: userId },
      { jobId: `erasure:${tenantId}` },
    );

    logger.info({ tenantId, userId, bullJobId: job.id }, "[tenancy] data erasure job enqueued");
    return { ok: true, jobId: job.id };
  }),
});
