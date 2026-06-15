import {
  createReplicateProvider,
  REPLICATE_MODEL_FLUX_2_PRO,
  REPLICATE_MODEL_NANO_BANANA_2,
  socialImageJobSchema,
  SOCIAL_IMAGE_QUEUE_NAME,
  type SocialImageJob,
  type UsageRecord,
} from "@marketing/ai-router";
import { BUDGET_KEY_TTL_SECONDS, getPlanCaps, monthlyBudgetKey } from "@marketing/billing";
import { aiUsage, socialPosts, tenants } from "@marketing/db";
import { db } from "@marketing/db";
import { env, hashId, logger, recordMetric } from "@marketing/shared";
import type { TenantContext } from "@marketing/tenancy";
import { and, eq, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import { UnrecoverableError, Worker } from "bullmq";
import { ingestRemoteImageToMediaAsset } from "../../lib/media-assets";
import { connection } from "./queue";

function planCacheKey(tenantId: string): string {
  return `tenant:plan:${tenantId}`;
}
const PLAN_CACHE_TTL_SECONDS = 60;

async function getTenantPlan(ctx: TenantContext): Promise<string> {
  const cached = await connection.get(planCacheKey(ctx.tenantId));
  if (cached !== null) return cached;

  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId));

  const plan = tenant?.plan ?? "trial";
  await connection
    .set(planCacheKey(ctx.tenantId), plan, "EX", PLAN_CACHE_TTL_SECONDS)
    .catch((err) => logger.warn({ err: String(err) }, "[social-image] plan cache set failed"));
  return plan;
}

async function getMonthlySpend(tenantId: string): Promise<number> {
  const key = monthlyBudgetKey(tenantId);
  const cached = await connection.get(key);
  if (cached !== null) return parseFloat(cached);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
    .from(aiUsage)
    .where(
      and(eq(aiUsage.tenantId, tenantId), sql`${aiUsage.createdAt} >= ${monthStart.toISOString()}`),
    );

  const spendUsd = parseFloat(row?.total ?? "0");
  await connection
    .set(key, spendUsd.toString(), "EX", BUDGET_KEY_TTL_SECONDS)
    .catch((err) => logger.warn({ err: String(err) }, "[social-image] budget cache set failed"));
  return spendUsd;
}

async function incrementMonthlySpend(tenantId: string, costUsd: number): Promise<void> {
  const key = monthlyBudgetKey(tenantId);
  const pipeline = connection.pipeline();
  pipeline.incrbyfloat(key, costUsd);
  pipeline.expire(key, BUDGET_KEY_TTL_SECONDS);
  await pipeline.exec();
}

async function insertAiUsage(record: UsageRecord): Promise<string> {
  const [row] = await db
    .insert(aiUsage)
    .values({
      tenantId: record.tenantId,
      jobId: record.jobId,
      provider: record.provider,
      model: record.model,
      promptId: record.promptId,
      promptVersion: record.promptVersion,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      costUsd: record.costUsd.toString(),
    })
    .onConflictDoNothing({ target: aiUsage.jobId })
    .returning({ id: aiUsage.id });

  if (row) return row.id;

  const [existing] = await db
    .select({ id: aiUsage.id })
    .from(aiUsage)
    .where(eq(aiUsage.jobId, record.jobId));
  return existing!.id;
}

export async function handleSocialImageJob(job: Job<SocialImageJob>): Promise<void> {
  const data = socialImageJobSchema.parse(job.data);
  const ctx: TenantContext = { tenantId: data.tenantId, userId: data.userId, role: "owner" };

  const [post] = await db
    .select({
      status: socialPosts.status,
      imageUrl: socialPosts.imageUrl,
    })
    .from(socialPosts)
    .where(and(eq(socialPosts.tenantId, data.tenantId), eq(socialPosts.jobId, data.postJobId)));

  if (!post) throw new UnrecoverableError("Post not found");
  if (post.status !== "completed") throw new UnrecoverableError("Post is not completed");
  if (data.action === "edit" && !data.inputImageUrl && !post.imageUrl) {
    throw new UnrecoverableError("No image is available to edit");
  }

  const [tenantRow] = await db
    .select({ suspended: tenants.suspended })
    .from(tenants)
    .where(eq(tenants.id, data.tenantId));
  if (tenantRow?.suspended) throw new UnrecoverableError(`Tenant ${data.tenantId} is suspended`);

  if (!env.REPLICATE_API_TOKEN) {
    throw new Error("Image generation is unavailable: REPLICATE_API_TOKEN is not set.");
  }

  const tenantPlan = await getTenantPlan(ctx);
  const planCaps = getPlanCaps(tenantPlan);
  const monthlySpend = await getMonthlySpend(data.tenantId);
  if (monthlySpend >= planCaps.monthlyAiBudgetUsd) {
    throw new UnrecoverableError(
      `Monthly AI budget exceeded (${tenantPlan}: USD ${planCaps.monthlyAiBudgetUsd.toFixed(2)})`,
    );
  }

  const provider = createReplicateProvider(env.REPLICATE_API_TOKEN);
  const result = await provider.generateImage(
    {
      prompt: data.prompt,
      aspectRatio: data.aspectRatio,
      inputImageUrl:
        data.action === "edit" ? (data.inputImageUrl ?? post.imageUrl ?? undefined) : undefined,
      preferredModelId: data.action === "generate" ? REPLICATE_MODEL_FLUX_2_PRO : undefined,
      allowedModelIds:
        data.action === "generate"
          ? [
              REPLICATE_MODEL_FLUX_2_PRO,
              REPLICATE_MODEL_NANO_BANANA_2,
              "google/imagen-4",
              "ideogram-ai/ideogram-v3-turbo",
              "black-forest-labs/flux-1.1-pro",
            ]
          : undefined,
    },
    { tenantId: data.tenantId, jobId: data.idempotencyKey },
  );

  if (result.costUsd * 100 > Math.min(data.costBudgetCents, planCaps.perJobBudgetCents)) {
    throw new Error(
      `Social image exceeded per-job budget (${result.model}: USD ${result.costUsd.toFixed(2)}).`,
    );
  }

  await insertAiUsage({
    tenantId: data.tenantId,
    jobId: data.idempotencyKey,
    provider: result.provider,
    model: result.model,
    promptId: data.promptId,
    promptVersion: data.promptVersion,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: result.costUsd,
  });
  await incrementMonthlySpend(data.tenantId, result.costUsd);

  const durableImage = await ingestRemoteImageToMediaAsset({
    tenantId: data.tenantId,
    scope: "social-creative",
    sourceUrl: result.url,
    originalFilenameBase: `social-post-${data.postJobId}`,
    storageKeyPrefix: `generated/social-images/${data.tenantId}`,
  });

  await db
    .update(socialPosts)
    .set({
      imageUrl: durableImage.publicUrl,
      creativePlan: null,
      creativeImageUrl: null,
      creativeStorageKey: null,
      creativeStatus: "idle",
      creativeError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.tenantId, data.tenantId), eq(socialPosts.jobId, data.postJobId)));

  logger.info(
    {
      postJobId: data.postJobId,
      tenantId: data.tenantId,
      action: data.action,
      model: result.model,
    },
    "[social-image] completed",
  );
  recordMetric("ai.job.completed", {
    queue: SOCIAL_IMAGE_QUEUE_NAME,
    tenantIdHash: hashId(data.tenantId),
  });
}

export const socialImageWorker = new Worker<SocialImageJob>(
  SOCIAL_IMAGE_QUEUE_NAME,
  handleSocialImageJob,
  {
    connection,
    concurrency: 2,
  },
);

socialImageWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[social-image] BullMQ job completed");
  recordMetric("queue.job.completed", { queue: SOCIAL_IMAGE_QUEUE_NAME, jobId: job.id });
});

socialImageWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[social-image] BullMQ job failed");
  recordMetric("queue.job.failed", {
    queue: SOCIAL_IMAGE_QUEUE_NAME,
    jobId: job?.id,
    err: err.message,
  });
});
