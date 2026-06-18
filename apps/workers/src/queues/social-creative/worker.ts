import {
  buildSocialCreativePlan,
  createAnthropicHaiku,
  createAnthropicSonnet,
  createOpenAIMini,
  createReplicateProvider,
  EchoProvider,
  extractSocialCreativePlanFromText,
  getPrompt,
  getSocialCreativePublicUrl,
  parsePromptInput,
  ProviderRouter,
  REPLICATE_MODEL_FLUX_2_PRO,
  REPLICATE_MODEL_NANO_BANANA_2,
  socialCreativeJobSchema,
  SOCIAL_CREATIVE_QUEUE_NAME,
  type SocialCreativeJob,
  type SocialCreativePlan,
  type UsageRecord,
} from "@marketing/ai-router";
import { BUDGET_KEY_TTL_SECONDS, getPlanCaps, monthlyBudgetKey } from "@marketing/billing";
import { aiUsage, businessProfiles, socialPosts, tenants } from "@marketing/db";
import { db } from "@marketing/db";
import { env, hashId, logger, recordMetric } from "@marketing/shared";
import type { TenantContext } from "@marketing/tenancy";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import { UnrecoverableError, Worker } from "bullmq";
import { registerStoredMediaAsset } from "../../lib/media-assets";
import { storeSocialCreativePng } from "../../lib/social-creative-storage";
import { connection } from "./queue";

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

let router: ProviderRouter | null = null;
function getRouter(): ProviderRouter {
  router ??= buildProviderRouter();
  return router;
}

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
    .catch((err) => logger.warn({ err: String(err) }, "[social-creative] plan cache set failed"));
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
    .catch((err) => logger.warn({ err: String(err) }, "[social-creative] budget cache set failed"));
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

export async function handleSocialCreativeJob(job: Job<SocialCreativeJob>): Promise<void> {
  const data = socialCreativeJobSchema.parse(job.data);
  const ctx: TenantContext = { tenantId: data.tenantId, userId: data.userId, role: "owner" };
  const now = new Date();

  try {
    const [post] = await db
      .select({
        status: socialPosts.status,
        generatedText: socialPosts.generatedText,
        imageUrl: socialPosts.imageUrl,
        promptInput: socialPosts.promptInput,
      })
      .from(socialPosts)
      .where(and(eq(socialPosts.tenantId, data.tenantId), eq(socialPosts.jobId, data.postJobId)));

    if (!post) throw new UnrecoverableError("Post not found");
    if (post.status !== "completed" || !post.generatedText) {
      throw new UnrecoverableError("Post is not completed");
    }

    const [tenantRow] = await db
      .select({ suspended: tenants.suspended })
      .from(tenants)
      .where(eq(tenants.id, data.tenantId));
    if (tenantRow?.suspended) {
      throw new UnrecoverableError(`Tenant ${data.tenantId} is suspended`);
    }

    const [profile] = await db
      .select({
        businessName: businessProfiles.businessName,
        vertical: businessProfiles.vertical,
        city: businessProfiles.addressCity,
        locale: businessProfiles.locale,
      })
      .from(businessProfiles)
      .where(eq(businessProfiles.tenantId, data.tenantId));

    const promptInput = parsePromptInput(post.promptInput);
    const deterministicPlan = buildSocialCreativePlan({
      businessName: profile?.businessName ?? "My Business",
      vertical: profile?.vertical,
      city: profile?.city,
      topic: promptInput.topic,
      highlights: promptInput.highlights,
      postText: post.generatedText,
      imageUrl: post.imageUrl,
      creativeDirection: data.creativeDirection,
      aspectRatio: data.aspectRatio,
      template: data.template,
    });

    const tenantPlan = await getTenantPlan(ctx);
    const planCaps = getPlanCaps(tenantPlan);
    const monthlySpend = await getMonthlySpend(data.tenantId);
    if (monthlySpend >= planCaps.monthlyAiBudgetUsd) {
      throw new UnrecoverableError(
        `Monthly AI budget exceeded (${tenantPlan}: USD ${planCaps.monthlyAiBudgetUsd.toFixed(2)})`,
      );
    }

    const creativePlan = await generateCreativePlan({
      data,
      profile: {
        businessName: profile?.businessName ?? "My Business",
        vertical: profile?.vertical ?? "SME",
        city: profile?.city ?? "Switzerland",
        locale: profile?.locale ?? "de-CH",
      },
      postText: post.generatedText,
      imageUrl: post.imageUrl,
      promptInput,
      deterministicPlan,
      tenantPlan,
      planCaps,
    });
    const renderPlan = await maybeGenerateCreativeBackground({
      data,
      plan: creativePlan,
      profile: {
        businessName: profile?.businessName ?? "My Business",
        vertical: profile?.vertical ?? "SME",
        city: profile?.city ?? "Switzerland",
        locale: profile?.locale ?? "de-CH",
      },
      postText: post.generatedText,
      promptInput,
      planCaps,
    });

    await db
      .update(socialPosts)
      .set({
        creativePlan: renderPlan,
        creativeTemplate: renderPlan.template,
        creativeAspectRatio: renderPlan.aspectRatio,
        creativeStatus: "pending",
        creativeError: null,
        creativeUpdatedAt: now,
        updatedAt: now,
      })
      .where(and(eq(socialPosts.tenantId, data.tenantId), eq(socialPosts.jobId, data.postJobId)));

    const renderUrl = getSocialCreativePublicUrl(
      data.renderAppUrl ?? env.APP_URL,
      data.postJobId,
      now,
    );
    const response = await fetch(renderUrl);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Social creative render failed (${response.status}): ${body.slice(0, 240)}`);
    }

    const png = new Uint8Array(await response.arrayBuffer());
    const stored = await storeSocialCreativePng({
      tenantId: data.tenantId,
      postJobId: data.postJobId,
      version: now,
      png,
    });
    const asset = await registerStoredMediaAsset({
      tenantId: data.tenantId,
      scope: "social-creative",
      storageKey: stored.storageKey,
      originalFilename: `social-creative-${data.postJobId}-${now.getTime()}.png`,
      contentType: "image/png",
      byteSize: png.byteLength,
    });

    await db
      .update(socialPosts)
      .set({
        creativePlan: renderPlan,
        creativeTemplate: renderPlan.template,
        creativeAspectRatio: renderPlan.aspectRatio,
        creativeImageUrl: asset.publicUrl,
        creativeStorageKey: stored.storageKey,
        creativeStatus: "completed",
        creativeError: null,
        creativeUpdatedAt: now,
        updatedAt: new Date(),
      })
      .where(and(eq(socialPosts.tenantId, data.tenantId), eq(socialPosts.jobId, data.postJobId)));

    logger.info(
      { postJobId: data.postJobId, tenantId: data.tenantId },
      "[social-creative] completed",
    );
    recordMetric("ai.job.completed", {
      queue: SOCIAL_CREATIVE_QUEUE_NAME,
      tenantIdHash: hashId(data.tenantId),
    });
  } catch (err) {
    await db
      .update(socialPosts)
      .set({
        creativeStatus: "failed",
        creativeError: String(err).slice(0, 500),
        creativeUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(socialPosts.tenantId, data.tenantId), eq(socialPosts.jobId, data.postJobId)))
      .catch(() => {});
    logger.error({ err: String(err), postJobId: data.postJobId }, "[social-creative] failed");
    recordMetric("ai.job.failed", {
      queue: SOCIAL_CREATIVE_QUEUE_NAME,
      tenantIdHash: hashId(data.tenantId),
      err: String(err),
    });
    throw err;
  }
}

async function maybeGenerateCreativeBackground(input: {
  data: SocialCreativeJob;
  plan: SocialCreativePlan;
  profile: { businessName: string; vertical: string; city: string; locale: string };
  postText: string;
  promptInput: { topic: string; highlights: string };
  planCaps: ReturnType<typeof getPlanCaps>;
}): Promise<SocialCreativePlan> {
  const direction = input.data.creativeDirection?.trim();
  if (!direction) return input.plan;

  if (!env.REPLICATE_API_TOKEN) {
    throw new Error(
      "Premium graphic background generation is unavailable: REPLICATE_API_TOKEN is not set.",
    );
  }

  const prompt = buildCreativeBackgroundPrompt({
    direction,
    plan: input.plan,
    profile: input.profile,
    postText: input.postText,
    promptInput: input.promptInput,
  });
  const provider = createReplicateProvider(env.REPLICATE_API_TOKEN);
  const backgroundJobId = deriveUuid(input.data.idempotencyKey, "social-creative-background");
  const result = await provider.generateImage(
    {
      prompt,
      aspectRatio: input.data.aspectRatio,
      preferredModelId: REPLICATE_MODEL_FLUX_2_PRO,
      allowedModelIds: [
        REPLICATE_MODEL_FLUX_2_PRO,
        REPLICATE_MODEL_NANO_BANANA_2,
        "google/imagen-4",
        "ideogram-ai/ideogram-v3-turbo",
        "black-forest-labs/flux-1.1-pro",
      ],
    },
    { tenantId: input.data.tenantId, jobId: backgroundJobId },
  );

  if (result.costUsd * 100 > input.planCaps.perJobBudgetCents) {
    throw new Error(
      `Social creative background exceeded per-job budget (${result.model}: USD ${result.costUsd.toFixed(2)}).`,
    );
  }

  await insertAiUsage({
    tenantId: input.data.tenantId,
    jobId: backgroundJobId,
    provider: result.provider,
    model: result.model,
    promptId: "social-creative-background-image-v1",
    promptVersion: 1,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: result.costUsd,
  });
  await incrementMonthlySpend(input.data.tenantId, result.costUsd);
  recordMetric("ai.cost.recorded", {
    tenantIdHash: hashId(input.data.tenantId),
    provider: result.provider,
    model: result.model,
    costUsd: result.costUsd,
    queue: SOCIAL_CREATIVE_QUEUE_NAME,
  });

  logger.info(
    { postJobId: input.data.postJobId, model: result.model },
    "[social-creative] generated premium background",
  );

  return {
    ...input.plan,
    backgroundStyle: input.plan.backgroundStyle ?? "product-scene",
    backgroundImageUrl: result.url,
    backgroundModel: result.model,
  };
}

function deriveUuid(seed: string, purpose: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`${purpose}:${seed}`).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildCreativeBackgroundPrompt(input: {
  direction: string;
  plan: SocialCreativePlan;
  profile: { businessName: string; vertical: string; city: string; locale: string };
  postText: string;
  promptInput: { topic: string; highlights: string };
}): string {
  return [
    "Create a premium advertising background image for a Swiss SME social media graphic.",
    `Business type: ${input.profile.vertical}. City/market: ${input.profile.city}. Locale: ${input.profile.locale}.`,
    `User creative direction: ${input.direction}.`,
    `Visual motif: ${input.plan.visualMotif ?? input.plan.visualCue}.`,
    `Post topic: ${input.promptInput.topic || input.plan.headline}.`,
    input.promptInput.highlights ? `Highlights: ${input.promptInput.highlights}.` : "",
    `Caption context: ${input.postText.slice(0, 280)}.`,
    "Composition: full-bleed editorial product scene, premium modern retail advertising, strong depth, natural light, realistic textures, fresh and appetizing.",
    "Leave clean negative space for a readable headline and CTA overlay. Do not add logos.",
    "Do not render any readable words, numbers, discount labels, or typography; the application will add exact text and the discount sticker afterward.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateCreativePlan(input: {
  data: SocialCreativeJob;
  profile: { businessName: string; vertical: string; city: string; locale: string };
  postText: string;
  imageUrl?: string | null;
  promptInput: { topic: string; highlights: string };
  deterministicPlan: SocialCreativePlan;
  tenantPlan: string;
  planCaps: ReturnType<typeof getPlanCaps>;
}): Promise<SocialCreativePlan> {
  const prompt = getPrompt(input.data.promptId);
  const userPrompt = prompt.buildUserPrompt({
    businessName: input.profile.businessName,
    vertical: input.profile.vertical,
    city: input.profile.city,
    locale: input.profile.locale,
    topic: input.promptInput.topic,
    highlights: input.promptInput.highlights,
    aspectRatio: input.data.aspectRatio,
    template: input.data.template,
    hasImage: input.imageUrl ? "true" : "false",
    creativeDirection: input.data.creativeDirection ?? "",
    variationSeed: input.data.variantNonce ?? input.data.idempotencyKey.slice(0, 8),
    postText: input.postText,
  });

  try {
    const result = await getRouter().route(
      {
        prompt: userPrompt,
        systemPrompt: prompt.systemPrompt,
        maxTokens: 700,
        temperature: input.data.creativeDirection ? 0.65 : 0.5,
      },
      {
        tenantId: input.data.tenantId,
        jobId: input.data.idempotencyKey,
        promptId: input.data.promptId,
        promptVersion: input.data.promptVersion,
        costBudgetCents: Math.min(input.data.costBudgetCents, input.planCaps.perJobBudgetCents),
      },
      {
        tenantPlan: input.tenantPlan,
        writeUsage: async (usageRecord) => {
          await insertAiUsage(usageRecord);
          await incrementMonthlySpend(input.data.tenantId, usageRecord.costUsd);
          recordMetric("ai.cost.recorded", {
            tenantIdHash: hashId(input.data.tenantId),
            provider: usageRecord.provider,
            model: usageRecord.model,
            costUsd: usageRecord.costUsd,
            queue: SOCIAL_CREATIVE_QUEUE_NAME,
          });
        },
      },
    );

    const parsed = extractSocialCreativePlanFromText(result.text);
    if (!parsed) return input.deterministicPlan;
    if (input.data.template !== "auto" && parsed.template !== input.data.template) {
      return input.deterministicPlan;
    }
    return { ...input.deterministicPlan, ...parsed, aspectRatio: input.data.aspectRatio };
  } catch (err) {
    logger.warn({ err: String(err) }, "[social-creative] AI plan failed; using fallback");
    return input.deterministicPlan;
  }
}

export const socialCreativeWorker = new Worker<SocialCreativeJob>(
  SOCIAL_CREATIVE_QUEUE_NAME,
  handleSocialCreativeJob,
  {
    connection,
    concurrency: 3,
  },
);

socialCreativeWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[social-creative] BullMQ job completed");
  recordMetric("queue.job.completed", { queue: SOCIAL_CREATIVE_QUEUE_NAME, jobId: job.id });
});

socialCreativeWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[social-creative] BullMQ job failed");
  recordMetric("queue.job.failed", {
    queue: SOCIAL_CREATIVE_QUEUE_NAME,
    jobId: job?.id,
    err: err.message,
  });
});
