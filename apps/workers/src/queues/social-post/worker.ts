import {
  type SocialPostJob,
  type UsageRecord,
  ProviderRouter,
  EchoProvider,
  getPrompt,
  socialPostJobSchema,
  SOCIAL_POST_QUEUE_NAME,
  createAnthropicSonnet,
  createAnthropicHaiku,
  createOpenAIMini,
} from "@marketing/ai-router";
import { getPlanCaps, monthlyBudgetKey, BUDGET_KEY_TTL_SECONDS } from "@marketing/billing";
import { db } from "@marketing/db";
import { aiUsage, socialPosts, tenants, outbox, tenantMetricsDaily } from "@marketing/db";
import { env, logger, recordMetric, hashId, TENANT_LIFECYCLE_EVENTS } from "@marketing/shared";
import type { TenantContext } from "@marketing/tenancy";
import type { Job } from "bullmq";
import { Worker, UnrecoverableError } from "bullmq";
import { eq, and, isNull, sql } from "drizzle-orm";
import { connection } from "./queue";

// ─── Provider router singleton ────────────────────────────────────────────────
function buildProviderRouter(): ProviderRouter {
  if (env.AI_PROVIDER_FALLBACK === "echo") {
    const echo = new EchoProvider();
    return new ProviderRouter({ trial: echo, primary: echo, fallback: echo });
  }
  if (env.ANTHROPIC_API_KEY) {
    const haiku = createAnthropicHaiku();
    const sonnet = createAnthropicSonnet();
    const fallback =
      env.AI_PROVIDER_FALLBACK === "openai" || env.OPENAI_API_KEY ? createOpenAIMini() : haiku;
    return new ProviderRouter({ trial: haiku, primary: sonnet, fallback });
  }
  if (env.OPENAI_API_KEY) {
    const mini = createOpenAIMini();
    return new ProviderRouter({ trial: mini, primary: mini, fallback: mini });
  }
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

let _router: ProviderRouter | null = null;
function getRouter(): ProviderRouter {
  if (!_router) _router = buildProviderRouter();
  return _router;
}

export function setRouterForTest(r: ProviderRouter): void {
  _router = r;
}

// ─── Monthly budget helpers ───────────────────────────────────────────────────

/** Returns current month's AI spend in USD. Redis-first, DB fallback. */
async function getMonthlySpend(tenantId: string): Promise<number> {
  const key = monthlyBudgetKey(tenantId);
  const cached = await connection.get(key);
  if (cached !== null) return parseFloat(cached);

  // Redis miss: aggregate from DB and repopulate.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
    .from(aiUsage)
    .where(
      and(eq(aiUsage.tenantId, tenantId), sql`${aiUsage.createdAt} >= ${monthStart.toISOString()}`),
    );

  const spendUsd = parseFloat(row?.total ?? "0");

  // Repopulate Redis (best-effort; don't fail the job if this errors).
  await connection
    .set(key, spendUsd.toString(), "EX", BUDGET_KEY_TTL_SECONDS)
    .catch((e) => logger.warn({ err: String(e) }, "[budget] Redis repopulate failed"));

  return spendUsd;
}

/** Atomically increments the monthly spend counter in Redis. */
async function incrementMonthlySpend(tenantId: string, costUsd: number): Promise<void> {
  const key = monthlyBudgetKey(tenantId);
  const pipeline = connection.pipeline();
  pipeline.incrbyfloat(key, costUsd);
  pipeline.expire(key, BUDGET_KEY_TTL_SECONDS);
  await pipeline.exec();
}

// ─── Repository helpers ───────────────────────────────────────────────────────

/** Redis key for the tenant plan cache. Invalidated by tenant.plan_changed handler. */
function planCacheKey(tenantId: string): string {
  return `tenant:plan:${tenantId}`;
}
const PLAN_CACHE_TTL_SECONDS = 60;

/** Returns the tenant's plan. Redis-first with 60 s TTL, DB fallback. */
async function getTenantPlan(ctx: TenantContext): Promise<string> {
  const key = planCacheKey(ctx.tenantId);
  const cached = await connection.get(key);
  if (cached !== null) return cached;

  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId));

  const plan = tenant?.plan ?? "trial";

  // Populate cache; best-effort — don't fail the job on Redis error.
  await connection
    .set(key, plan, "EX", PLAN_CACHE_TTL_SECONDS)
    .catch((e) => logger.warn({ err: String(e) }, "[plan-cache] Redis set failed"));

  return plan;
}

async function getSocialPostByJobId(ctx: TenantContext, jobId: string) {
  const [post] = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.tenantId, ctx.tenantId), eq(socialPosts.jobId, jobId)));
  return post ?? null;
}

async function upsertSocialPostPending(
  ctx: TenantContext,
  jobId: string,
  promptInput: object,
  threadId?: string,
  parentJobId?: string,
  refinementInstruction?: string,
  imageUrl?: string | null,
) {
  await db
    .insert(socialPosts)
    .values({
      tenantId: ctx.tenantId,
      jobId,
      promptInput,
      status: "pending",
      threadId: threadId ?? jobId, // first post in thread is its own root
      parentJobId: parentJobId ?? null,
      refinementInstruction: refinementInstruction ?? null,
      // Carry a previously generated image forward so refining the text
      // doesn't drop the image the user already made.
      imageUrl: imageUrl ?? null,
    })
    .onConflictDoNothing({ target: socialPosts.jobId });
}

async function markSocialPostCompleted(
  ctx: TenantContext,
  jobId: string,
  generatedText: string,
  aiUsageId: string,
) {
  await db
    .update(socialPosts)
    .set({ status: "completed", generatedText, aiUsageId, updatedAt: new Date() })
    .where(and(eq(socialPosts.tenantId, ctx.tenantId), eq(socialPosts.jobId, jobId)));
}

async function markSocialPostFailed(ctx: TenantContext, jobId: string) {
  await db
    .update(socialPosts)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(socialPosts.tenantId, ctx.tenantId), eq(socialPosts.jobId, jobId)));
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

  // Idempotent retry: row was already written by a previous attempt.
  const [existing] = await db
    .select({ id: aiUsage.id })
    .from(aiUsage)
    .where(eq(aiUsage.jobId, record.jobId));
  return existing!.id;
}

async function emitOutboxEvent(ctx: TenantContext, type: string, payload: object) {
  await db.insert(outbox).values({ tenantId: ctx.tenantId, type, payload });
}

/** Upserts the tenant_metrics_daily row for today, incrementing posts_generated. */
async function upsertDailyMetricsPost(ctx: TenantContext, vertical: string, plan: string) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  await db
    .insert(tenantMetricsDaily)
    .values({
      tenantId: ctx.tenantId,
      dayDate: today,
      vertical,
      postsGenerated: 1,
      plan,
    })
    .onConflictDoUpdate({
      target: [tenantMetricsDaily.tenantId, tenantMetricsDaily.dayDate],
      set: {
        postsGenerated: sql`${tenantMetricsDaily.postsGenerated} + 1`,
        plan,
        updatedAt: new Date(),
      },
    });
}

/**
 * Stamps tenants.first_post_at once (WHERE first_post_at IS NULL) then emits
 * tenant.first_post_emitted into the outbox. These are two separate statements,
 * not a transaction. A crash between the UPDATE and the INSERT would leave
 * first_post_at stamped but no event in the outbox. Acceptable at design-partner
 * scale (< 10 tenants); wrap in a DB transaction if this becomes load-bearing.
 */
async function maybeEmitFirstPost(ctx: TenantContext, vertical: string, jobId: string) {
  const now = new Date();
  // UPDATE ... WHERE first_post_at IS NULL returns the row only if it was updated.
  const updated = await db
    .update(tenants)
    .set({ firstPostAt: now, updatedAt: now })
    .where(and(eq(tenants.id, ctx.tenantId), isNull(tenants.firstPostAt)))
    .returning({ id: tenants.id });

  if (updated.length === 0) return; // already stamped — not the first post

  await db.insert(outbox).values({
    tenantId: ctx.tenantId,
    type: TENANT_LIFECYCLE_EVENTS.FIRST_POST_EMITTED,
    payload: {
      tenantId: ctx.tenantId,
      firstPostAt: now.toISOString(),
      vertical,
      jobId,
    },
  });
}

// ─── Job handler ──────────────────────────────────────────────────────────────

export async function handleSocialPostJob(job: Job<SocialPostJob>): Promise<void> {
  const data = socialPostJobSchema.parse(job.data);
  const { tenantId, jobId } = data;

  const ctx: TenantContext = { tenantId, userId: data.userId, role: "owner" };

  // Idempotency: completed jobs are not re-processed.
  const existing = await getSocialPostByJobId(ctx, jobId);
  if (existing?.status === "completed") {
    logger.info({ jobId }, "[social-post] already completed — skipping");
    return;
  }

  // For a refinement, inherit the parent post's image so iterating on the text
  // keeps the image the user already generated.
  let inheritedImageUrl: string | null = null;
  if (data.parentJobId) {
    const parent = await getSocialPostByJobId(ctx, data.parentJobId);
    inheritedImageUrl = parent?.imageUrl ?? null;
  }

  // Write pending row (noop on duplicate from a previous attempt).
  await upsertSocialPostPending(
    ctx,
    jobId,
    {
      topic: data.topic,
      highlights: data.highlights,
      vertical: data.vertical,
      businessName: data.businessName,
      refinementInstruction: data.refinementInstruction,
    },
    data.threadId,
    data.parentJobId,
    data.refinementInstruction,
    inheritedImageUrl,
  );

  const tenantPlan = await getTenantPlan(ctx);
  const planCaps = getPlanCaps(tenantPlan);

  // ─── Suspension pre-check ────────────────────────────────────────────────
  // Check at job START; in-flight jobs are not interrupted (non-negotiable).
  const [tenantRow] = await db
    .select({ suspended: tenants.suspended })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (tenantRow?.suspended) {
    await markSocialPostFailed(ctx, jobId);
    logger.warn({ tenantId }, "[social-post] tenant suspended — aborting");
    throw new UnrecoverableError(`Tenant ${tenantId} is suspended`);
  }

  // ─── Monthly budget pre-check (ADR-0011) ──────────────────────────────────
  // Abort without retry if the tenant has exhausted their monthly AI budget.
  const monthlySpend = await getMonthlySpend(tenantId);
  if (monthlySpend >= planCaps.monthlyAiBudgetUsd) {
    await markSocialPostFailed(ctx, jobId);
    logger.warn(
      { tenantId, tenantPlan, monthlySpend, cap: planCaps.monthlyAiBudgetUsd },
      "[social-post] monthly budget exceeded — aborting",
    );
    // UnrecoverableError tells BullMQ to move to failed without retrying.
    throw new UnrecoverableError(
      `Monthly AI budget exceeded (${tenantPlan}: USD ${planCaps.monthlyAiBudgetUsd.toFixed(2)})`,
    );
  }

  const prompt = getPrompt(data.promptId);
  const userPrompt = prompt.buildUserPrompt({
    businessName: data.businessName,
    vertical: data.vertical,
    city: data.city ?? "",
    topic: data.topic,
    highlights: data.highlights ?? "",
    ...(data.previousDraft && { previousDraft: data.previousDraft }),
    ...(data.refinementInstruction && { refinementInstruction: data.refinementInstruction }),
  });

  let aiUsageId: string;

  try {
    const result = await getRouter().route(
      {
        prompt: userPrompt,
        systemPrompt: prompt.systemPrompt,
        maxTokens: 400,
        temperature: 0.7,
      },
      {
        tenantId,
        jobId,
        promptId: data.promptId,
        promptVersion: data.promptVersion,
        costBudgetCents: planCaps.perJobBudgetCents,
      },
      {
        tenantPlan,
        writeUsage: async (usageRecord) => {
          aiUsageId = await insertAiUsage(usageRecord);
          await incrementMonthlySpend(tenantId, usageRecord.costUsd);
          recordMetric("ai.cost.recorded", {
            tenantIdHash: hashId(tenantId),
            provider: usageRecord.provider,
            model: usageRecord.model,
            costUsd: usageRecord.costUsd,
            queue: SOCIAL_POST_QUEUE_NAME,
          });
        },
      },
    );

    await markSocialPostCompleted(ctx, jobId, result.text, aiUsageId!);

    // Upsert daily metrics row (ADR-0016 §D2 — forward path).
    await upsertDailyMetricsPost(ctx, data.vertical, tenantPlan);

    // Stamp first_post_at once and emit lifecycle event (ADR-0016 §D3).
    await maybeEmitFirstPost(ctx, data.vertical, jobId);

    await emitOutboxEvent(ctx, "ai.social_post.generated", {
      jobId,
      tenantId,
      provider: result.provider,
      model: result.model,
      costUsd: result.costUsd,
    });

    logger.info({ jobId, tenantId }, "[social-post] job completed");
    recordMetric("ai.job.completed", {
      queue: SOCIAL_POST_QUEUE_NAME,
      tenantIdHash: hashId(tenantId),
    });
  } catch (err) {
    // Don't re-mark failed if it's already been set by the budget check.
    if (existing?.status !== "failed") {
      await markSocialPostFailed(ctx, jobId);
    }
    logger.error({ jobId, tenantId, err: String(err) }, "[social-post] job failed");
    recordMetric("ai.job.failed", {
      queue: SOCIAL_POST_QUEUE_NAME,
      tenantIdHash: hashId(tenantId),
      err: String(err),
    });
    throw err;
  }
}

// ─── BullMQ Worker registration ───────────────────────────────────────────────

export const socialPostWorker = new Worker<SocialPostJob>(
  SOCIAL_POST_QUEUE_NAME,
  handleSocialPostJob,
  {
    connection,
    concurrency: 5,
  },
);

socialPostWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[social-post] BullMQ job completed");
  recordMetric("queue.job.completed", { queue: SOCIAL_POST_QUEUE_NAME, jobId: job.id });
});

socialPostWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[social-post] BullMQ job failed");
  recordMetric("queue.job.failed", {
    queue: SOCIAL_POST_QUEUE_NAME,
    jobId: job?.id,
    err: err.message,
  });
});
