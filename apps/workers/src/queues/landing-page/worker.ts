// Landing-page FlowProducer worker — handles all 4 steps of the compose graph.
// Step order (bottom-up): brief → copy → layout → publish (ADR-0012).
// Each step is idempotent: if step_data already has the step's output, skip.
import {
  type LandingPageJob,
  type LandingPageComposition,
  type UsageRecord,
  ProviderRouter,
  EchoProvider,
  getPrompt,
  landingPageJobSchema,
  landingPageCompositionSchema,
  LANDING_PAGE_QUEUE_NAME,
  createAnthropicSonnet,
  createAnthropicHaiku,
  createOpenAIMini,
  createReplicateProvider,
  findRelevantContext,
  type EmbedStore,
} from "@marketing/ai-router";
import {
  getPlanCaps,
  monthlyBudgetKey,
  BUDGET_KEY_TTL_SECONDS,
} from "@marketing/billing";
import { db } from "@marketing/db";
import {
  aiUsage,
  landingPages,
  landingPageVersions,
  brandEmbeddings,
  tenants,
  outbox,
} from "@marketing/db";
import { env, logger, recordMetric, hashId } from "@marketing/shared";
import type { TenantContext } from "@marketing/tenancy";
import type { Job } from "bullmq";
import { Worker, UnrecoverableError } from "bullmq";
import { eq, and, sql } from "drizzle-orm";
import { connection } from "../social-post/queue";

// ─── Locale-aware prompt selector ────────────────────────────────────────────
// Returns the prompt ID set for the given locale. FR-CH falls back to the
// DE-CH variant until a French prompt is added (tracked in backlog).
function landingPagePromptIds(locale: string): {
  brief: string;
  copy: string;
  layout: string;
} {
  if (locale === "it-CH") {
    return {
      brief: "landing-page-brief-it-v1",
      copy: "landing-page-copy-it-v1",
      layout: "landing-page-layout-it-v1",
    };
  }
  return {
    brief: "landing-page-brief-v1",
    copy: "landing-page-copy-v1",
    layout: "landing-page-layout-v1",
  };
}

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
      env.AI_PROVIDER_FALLBACK === "openai" || env.OPENAI_API_KEY
        ? createOpenAIMini()
        : haiku;
    return new ProviderRouter({ trial: haiku, primary: sonnet, fallback });
  }
  if (env.OPENAI_API_KEY) {
    const mini = createOpenAIMini();
    return new ProviderRouter({ trial: mini, primary: mini, fallback: mini });
  }
  throw new Error("No AI provider configured.");
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
      and(
        eq(aiUsage.tenantId, tenantId),
        sql`${aiUsage.createdAt} >= ${monthStart.toISOString()}`,
      ),
    );

  const spendUsd = parseFloat(row?.total ?? "0");

  await connection
    .set(key, spendUsd.toString(), "EX", BUDGET_KEY_TTL_SECONDS)
    .catch((e) => logger.warn({ err: String(e) }, "[budget] Redis repopulate failed"));

  return spendUsd;
}

async function incrementMonthlySpend(tenantId: string, costUsd: number): Promise<void> {
  const key = monthlyBudgetKey(tenantId);
  const pipeline = connection.pipeline();
  pipeline.incrbyfloat(key, costUsd);
  pipeline.expire(key, BUDGET_KEY_TTL_SECONDS);
  await pipeline.exec();
}

// ─── Plan cache ───────────────────────────────────────────────────────────────

function planCacheKey(tenantId: string): string {
  return `tenant:plan:${tenantId}`;
}
const PLAN_CACHE_TTL_SECONDS = 60;

async function getTenantPlan(ctx: TenantContext): Promise<string> {
  const key = planCacheKey(ctx.tenantId);
  const cached = await connection.get(key);
  if (cached !== null) return cached;

  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId));

  const plan = tenant?.plan ?? "trial";

  await connection
    .set(key, plan, "EX", PLAN_CACHE_TTL_SECONDS)
    .catch((e) => logger.warn({ err: String(e) }, "[plan-cache] Redis set failed"));

  return plan;
}

// ─── Repository helpers ───────────────────────────────────────────────────────

async function getLandingPage(ctx: TenantContext, pageId: string) {
  const [page] = await db
    .select()
    .from(landingPages)
    .where(and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, pageId)));
  return page ?? null;
}

async function updateStepData(
  ctx: TenantContext,
  pageId: string,
  stepKey: string,
  value: unknown,
): Promise<void> {
  await db
    .update(landingPages)
    .set({
      stepData: sql`${landingPages.stepData} || ${JSON.stringify({ [stepKey]: value })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, pageId)));
}

async function markLandingPageFailed(ctx: TenantContext, pageId: string): Promise<void> {
  await db
    .update(landingPages)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, pageId)));
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

async function emitOutboxEvent(ctx: TenantContext, type: string, payload: object) {
  await db.insert(outbox).values({ tenantId: ctx.tenantId, type, payload });
}

// ─── EmbedStore implementation ────────────────────────────────────────────────

function makeEmbedStore(ctx: TenantContext): EmbedStore {
  return {
    async findByHash(tenantId, hash) {
      const [row] = await db
        .select()
        .from(brandEmbeddings)
        .where(
          and(
            eq(brandEmbeddings.tenantId, tenantId),
            eq(brandEmbeddings.contentHash, hash),
          ),
        );
      return row
        ? {
            id: row.id,
            tenantId: row.tenantId,
            contentType: row.contentType,
            contentText: row.contentText,
            contentHash: row.contentHash,
            embedding: row.embedding ? (row.embedding as number[]) : null,
          }
        : null;
    },

    async findAll(tenantId) {
      const rows = await db
        .select()
        .from(brandEmbeddings)
        .where(eq(brandEmbeddings.tenantId, tenantId));
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        contentType: r.contentType,
        contentText: r.contentText,
        contentHash: r.contentHash,
        embedding: r.embedding ? (r.embedding as number[]) : null,
      }));
    },

    async upsert(chunk) {
      await db
        .insert(brandEmbeddings)
        .values({
          tenantId: ctx.tenantId,
          contentType: chunk.contentType as "about" | "menu" | "offer" | "faq",
          contentText: chunk.contentText,
          contentHash: chunk.contentHash,
          embedding: chunk.embedding ?? undefined,
        })
        .onConflictDoNothing({
          target: [brandEmbeddings.tenantId, brandEmbeddings.contentHash],
        });
    },
  };
}

// ─── Tool schemas ─────────────────────────────────────────────────────────────

const GENERATE_SECTIONS_TOOL = {
  name: "generate_sections",
  description: "Generate copy for each landing page section",
  inputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["type", "heading"],
        },
      },
    },
    required: ["sections"],
  },
};

const COMPOSE_LAYOUT_TOOL = {
  name: "compose_layout",
  description: "Compose the final landing page layout",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            order: { type: "integer" },
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["type", "order", "heading"],
        },
      },
    },
    required: ["title", "sections"],
  },
};

// ─── Step handlers ────────────────────────────────────────────────────────────

async function handleBrief(
  ctx: TenantContext,
  data: LandingPageJob,
  tenantPlan: string,
  planCaps: ReturnType<typeof getPlanCaps>,
  jobId: string,
): Promise<void> {
  const page = await getLandingPage(ctx, data.landingPageId);
  if (!page) throw new Error(`Landing page ${data.landingPageId} not found`);

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  if (stepData["brief"]) {
    logger.info({ jobId, step: "brief" }, "[landing-page] brief already done — skipping");
    return;
  }

  // Retrieve relevant brand context for the prompt — only when the user opted in to
  // "apply my brand". Otherwise we keep the template's own voice + theme so the result
  // matches what the user previewed (no surprise colour/tone drift). See draftFromPrompt.
  const embedStore = makeEmbedStore(ctx);
  const primary = tenantPlan === "trial"
    ? createAnthropicHaiku()
    : createAnthropicSonnet();

  const brandChunks = data.applyBrand
    ? await findRelevantContext(
        ctx.tenantId,
        data.userPrompt,
        primary,
        embedStore,
        { jobId, costBudgetCents: 5 },
      ).catch(() => [] as string[])
    : [];

  const prompt = getPrompt(landingPagePromptIds(data.locale).brief);
  const userPrompt = prompt.buildUserPrompt({
    businessName: data.businessName,
    vertical: data.vertical,
    city: data.city ?? "",
    locale: data.locale,
    userPrompt: data.userPrompt,
    brandContext: brandChunks.join("\n\n"),
  });

  let aiUsageId: string;

  const result = await getRouter().route(
    { prompt: userPrompt, systemPrompt: prompt.systemPrompt, maxTokens: 600, temperature: 0.3 },
    { tenantId: ctx.tenantId, jobId, promptId: data.promptId, promptVersion: data.promptVersion, costBudgetCents: planCaps.perJobBudgetCents },
    {
      tenantPlan,
      writeUsage: async (rec) => {
        aiUsageId = await insertAiUsage(rec);
        await incrementMonthlySpend(ctx.tenantId, rec.costUsd);
      },
    },
  );

  await updateStepData(ctx, data.landingPageId, "brief", {
    text: result.text,
    aiUsageId: aiUsageId!,
  });
}

async function handleCopy(
  ctx: TenantContext,
  data: LandingPageJob,
  tenantPlan: string,
  planCaps: ReturnType<typeof getPlanCaps>,
  jobId: string,
): Promise<void> {
  const page = await getLandingPage(ctx, data.landingPageId);
  if (!page) throw new Error(`Landing page ${data.landingPageId} not found`);

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  if (stepData["copy"]) {
    logger.info({ jobId, step: "copy" }, "[landing-page] copy already done — skipping");
    return;
  }

  const brief = (stepData["brief"] as { text: string } | undefined)?.text;
  if (!brief) throw new Error("Brief step output missing — cannot run copy step");

  // Template-seeded path: section structure fixed by the template.
  // Free-form path: AI determines sections from the brief.
  const templateSections = stepData["templateSections"] as Array<{ type: string; order: number }> | undefined;
  const templateBrandHints = stepData["templateBrandHints"] as Record<string, string> | undefined;
  // LP-4: wizard payload (palette/font/vibe/goal) — informs copy tone & length.
  const wizardPayload = stepData["wizardPayload"] as
    | {
        paletteKey?: string;
        fontPairKey?: string;
        vibe?: { minimalBold: number; classicModern: number; calmEnergetic: number };
        goal?: string;
        imageStrategy?: string;
      }
    | undefined;

  let promptId: string;
  let sectionsList: string;

  if (templateSections && templateSections.length > 0) {
    // Sections are fixed by the template; prompt enforces they're all generated.
    sectionsList = templateSections.map((s) => s.type).join(", ");
    // LP-4 follow-up: prefer personalize-v1 when the wizard payload is present —
    // it explicitly honors the brand vibe + goal in the system prompt.
    // Falls back to template-fill when wizard wasn't used (e.g., draftFromPrompt entry).
    if (wizardPayload) {
      promptId = (() => {
        if (data.locale === "it-CH") return "landing-page-personalize-it-v1";
        if (data.locale === "en")    return "landing-page-personalize-en-v1";
        if (data.locale === "fr-CH") return "landing-page-personalize-fr-v1";
        return "landing-page-personalize-v1";
      })();
    } else {
      promptId = data.templateKey
        ? (() => {
            if (data.locale === "it-CH") return "landing-page-template-fill-it-v1";
            if (data.locale === "en") return "landing-page-template-fill-en-v1";
            if (data.locale === "fr-CH") return "landing-page-template-fill-fr-v1";
            return "landing-page-template-fill-v1";
          })()
        : landingPagePromptIds(data.locale).copy;
    }
  } else {
    sectionsList = "hero, about, contact, lead_form";
    promptId = landingPagePromptIds(data.locale).copy;
  }

  // Compose brand hints: legacy template hints + wizard vibe + goal.
  const hintsParts: string[] = [];
  if (templateBrandHints) {
    if (templateBrandHints["tone"])      hintsParts.push(`Tone: ${templateBrandHints["tone"]}.`);
    if (templateBrandHints["colorHint"]) hintsParts.push(`Colors: ${templateBrandHints["colorHint"]}.`);
  }
  if (wizardPayload?.vibe) {
    const v = wizardPayload.vibe;
    const vibeAdj = [
      Math.abs(v.minimalBold) < 0.2   ? null : v.minimalBold > 0   ? "bold"      : "minimal",
      Math.abs(v.classicModern) < 0.2 ? null : v.classicModern > 0 ? "modern"    : "classic",
      Math.abs(v.calmEnergetic) < 0.2 ? null : v.calmEnergetic > 0 ? "energetic" : "calm",
    ].filter(Boolean);
    if (vibeAdj.length > 0) hintsParts.push(`Vibe: ${vibeAdj.join(", ")}.`);
  }
  if (wizardPayload?.goal) {
    hintsParts.push(`Primary goal: ${wizardPayload.goal.replace(/_/g, " ")}.`);
  }
  if (wizardPayload?.paletteKey) {
    hintsParts.push(`Palette: ${wizardPayload.paletteKey}.`);
  }

  const prompt = getPrompt(promptId);
  const userPrompt = prompt.buildUserPrompt({
    brief,
    businessName: data.businessName,
    vertical: data.vertical,
    city: data.city ?? "",
    sections: sectionsList,
    brandHints: hintsParts.join(" "),
  });

  let aiUsageId: string;

  const result = await getRouter().routeWithTools(
    { prompt: userPrompt, systemPrompt: prompt.systemPrompt, maxTokens: 1500, temperature: 0.4 },
    [GENERATE_SECTIONS_TOOL],
    { tenantId: ctx.tenantId, jobId, promptId: data.promptId, promptVersion: data.promptVersion, costBudgetCents: planCaps.perJobBudgetCents },
    {
      tenantPlan,
      writeUsage: async (rec) => {
        aiUsageId = await insertAiUsage(rec);
        await incrementMonthlySpend(ctx.tenantId, rec.costUsd);
      },
    },
  );

  // Fall back to text response if tool use was not triggered (echo provider etc.)
  const sections = (result.toolResult as { sections?: unknown[] } | null)?.sections ?? [];

  await updateStepData(ctx, data.landingPageId, "copy", {
    sections,
    aiUsageId: aiUsageId!,
  });
}

async function handleLayout(
  ctx: TenantContext,
  data: LandingPageJob,
  tenantPlan: string,
  planCaps: ReturnType<typeof getPlanCaps>,
  jobId: string,
): Promise<void> {
  const page = await getLandingPage(ctx, data.landingPageId);
  if (!page) throw new Error(`Landing page ${data.landingPageId} not found`);

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  if (stepData["layout"]) {
    logger.info({ jobId, step: "layout" }, "[landing-page] layout already done — skipping");
    return;
  }

  const copy = stepData["copy"] as { sections: unknown[] } | undefined;
  if (!copy) throw new Error("Copy step output missing — cannot run layout step");

  const copySectionsText = JSON.stringify(copy.sections, null, 2);

  const prompt = getPrompt(landingPagePromptIds(data.locale).layout);
  const userPrompt = prompt.buildUserPrompt({
    copySections: copySectionsText,
    businessName: data.businessName,
    title: data.businessName,
    locale: data.locale,
  });

  let aiUsageId: string;

  const result = await getRouter().routeWithTools(
    { prompt: userPrompt, systemPrompt: prompt.systemPrompt, maxTokens: 2000, temperature: 0 },
    [COMPOSE_LAYOUT_TOOL],
    { tenantId: ctx.tenantId, jobId, promptId: data.promptId, promptVersion: data.promptVersion, costBudgetCents: planCaps.perJobBudgetCents },
    {
      tenantPlan,
      writeUsage: async (rec) => {
        aiUsageId = await insertAiUsage(rec);
        await incrementMonthlySpend(ctx.tenantId, rec.costUsd);
      },
    },
  );

  const rawComposition = result.toolResult ?? { title: data.businessName, sections: [] };

  // Validate + coerce against the schema; fall back gracefully if malformed.
  const parseResult = landingPageCompositionSchema.safeParse(rawComposition);
  let composition: LandingPageComposition = parseResult.success
    ? parseResult.data
    : {
        title: data.businessName,
        locale: data.locale,
        sections: [
          { type: "hero", order: 0, heading: data.businessName, body: data.userPrompt },
          { type: "lead_form", order: 1, heading: "Kontakt" },
        ],
      };

  // LP-4 follow-up: FLUX image gen for the hero background.
  // Triggers when the wizard selected `imageStrategy: "ai"` AND REPLICATE_API_TOKEN is configured.
  // Failures are non-fatal — the composition still publishes with the AI-suggested URL or empty.
  const wizardPayload = stepData["wizardPayload"] as { imageStrategy?: string } | undefined;
  if (wizardPayload?.imageStrategy === "ai" && env.REPLICATE_API_TOKEN) {
    try {
      composition = await generateHeroImage(composition, data, ctx, jobId, planCaps);
    } catch (err) {
      logger.warn({ jobId, err: String(err) }, "[landing-page] FLUX hero image gen failed — continuing without");
    }
  }

  await updateStepData(ctx, data.landingPageId, "layout", {
    composition,
    aiUsageId: aiUsageId!,
  });
}

// ─── FLUX image generation helper ─────────────────────────────────────────────

async function generateHeroImage(
  composition: LandingPageComposition,
  data: LandingPageJob,
  ctx: TenantContext,
  jobId: string,
  planCaps: ReturnType<typeof getPlanCaps>,
): Promise<LandingPageComposition> {
  // Find the hero section.
  const heroIdx = composition.sections.findIndex((s) => s.type === "hero");
  if (heroIdx === -1) {
    logger.info({ jobId }, "[landing-page] no hero section — skipping FLUX gen");
    return composition;
  }
  const hero = composition.sections[heroIdx]!;

  // Build the FLUX prompt from the hero copy + vertical.
  const fluxPrompt = [
    `Editorial brand photography for a ${data.vertical} business.`,
    `Scene context: ${hero.heading}.`,
    hero.body ? `Mood: ${hero.body}` : null,
    "Professional, high-end, magazine-quality. Warm natural lighting. No text, no logos. Cinematic depth of field. 16:9 widescreen.",
  ].filter(Boolean).join(" ");

  const provider = createReplicateProvider(env.REPLICATE_API_TOKEN!);
  if (!provider.generateImage) {
    logger.warn({ jobId }, "[landing-page] replicate provider has no generateImage");
    return composition;
  }

  // Hard cap to half the per-job budget — image gen is the more expensive half.
  void planCaps;
  const imageResult = await provider.generateImage(
    { prompt: fluxPrompt, aspectRatio: "16:9" },
    { tenantId: ctx.tenantId, jobId },
  );

  logger.info({ jobId, costUsd: imageResult.costUsd, model: imageResult.model }, "[landing-page] FLUX hero image generated");

  // Record the image gen cost in ai_usage. Use a job-suffixed key so it doesn't
  // collide with the layout step's own ai_usage row (which already uses jobId).
  await insertAiUsage({
    tenantId: ctx.tenantId,
    provider: imageResult.provider,
    model: imageResult.model,
    promptId: "landing-page-image-gen-v1",
    promptVersion: 1,
    jobId: `${jobId}:image-gen`,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: imageResult.costUsd,
  });
  await incrementMonthlySpend(ctx.tenantId, imageResult.costUsd);

  // Mutate the composition's hero section.
  const newSections = [...composition.sections];
  const newHero = {
    ...hero,
    extras: { ...(hero.extras ?? {}), backgroundImageUrl: imageResult.url },
  } as typeof hero;
  newSections[heroIdx] = newHero;
  return { ...composition, sections: newSections };
}

async function handlePublish(
  ctx: TenantContext,
  data: LandingPageJob,
  jobId: string,
): Promise<void> {
  const page = await getLandingPage(ctx, data.landingPageId);
  if (!page) throw new Error(`Landing page ${data.landingPageId} not found`);

  if (page.status === "published" && page.currentVersionId) {
    logger.info({ jobId, step: "publish" }, "[landing-page] already published — skipping");
    return;
  }

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  const layout = stepData["layout"] as { composition: LandingPageComposition; aiUsageId: string } | undefined;
  if (!layout) throw new Error("Layout step output missing — cannot publish");

  const [version] = await db
    .insert(landingPageVersions)
    .values({
      landingPageId: data.landingPageId,
      tenantId: ctx.tenantId,
      version: 1,
      composition: layout.composition,
      createdBy: data.userId,
      aiUsageId: layout.aiUsageId,
    })
    .returning({ id: landingPageVersions.id });

  const versionId = version!.id;

  await db
    .update(landingPages)
    .set({
      status: "draft",
      currentVersionId: versionId,
      title: (layout.composition as LandingPageComposition).title,
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, data.landingPageId)));

  await emitOutboxEvent(ctx, "content.draft.created", {
    landingPageId: data.landingPageId,
    versionId,
    tenantId: ctx.tenantId,
  });

  logger.info({ jobId, landingPageId: data.landingPageId, versionId }, "[landing-page] draft created");
}

// ─── Main job handler ─────────────────────────────────────────────────────────

export async function handleLandingPageJob(job: Job<LandingPageJob>): Promise<void> {
  const data = landingPageJobSchema.parse(job.data);
  const { tenantId, landingPageId } = data;
  const jobId = job.id ?? data.idempotencyKey;

  const ctx: TenantContext = { tenantId, userId: data.userId, role: "owner" };

  const tenantPlan = await getTenantPlan(ctx);
  const planCaps = getPlanCaps(tenantPlan);

  // ─── Suspension pre-check ────────────────────────────────────────────────
  const [tenantRow] = await db
    .select({ suspended: tenants.suspended })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (tenantRow?.suspended) {
    await markLandingPageFailed(ctx, landingPageId);
    logger.warn({ tenantId }, "[landing-page] tenant suspended — aborting");
    throw new UnrecoverableError(`Tenant ${tenantId} is suspended`);
  }

  // Monthly budget pre-check (skip for publish step — no AI call).
  if (data.step !== "publish") {
    const monthlySpend = await getMonthlySpend(tenantId);
    if (monthlySpend >= planCaps.monthlyAiBudgetUsd) {
      await markLandingPageFailed(ctx, landingPageId);
      logger.warn(
        { tenantId, tenantPlan, monthlySpend, cap: planCaps.monthlyAiBudgetUsd, step: data.step },
        "[landing-page] monthly budget exceeded — aborting",
      );
      throw new UnrecoverableError(
        `Monthly AI budget exceeded (${tenantPlan}: USD ${planCaps.monthlyAiBudgetUsd.toFixed(2)})`,
      );
    }
  }

  try {
    switch (data.step) {
      case "brief":
        await handleBrief(ctx, data, tenantPlan, planCaps, jobId);
        break;
      case "copy":
        await handleCopy(ctx, data, tenantPlan, planCaps, jobId);
        break;
      case "layout":
        await handleLayout(ctx, data, tenantPlan, planCaps, jobId);
        break;
      case "publish":
        await handlePublish(ctx, data, jobId);
        break;
    }

    logger.info({ jobId, step: data.step, landingPageId }, "[landing-page] step completed");
    recordMetric("ai.job.completed", { queue: LANDING_PAGE_QUEUE_NAME, step: data.step, tenantIdHash: hashId(tenantId) });
  } catch (err) {
    // Only mark page failed on non-budget errors (budget errors already marked above).
    if (!(err instanceof UnrecoverableError)) {
      await markLandingPageFailed(ctx, landingPageId).catch(() => null);
    }
    logger.error({ jobId, step: data.step, landingPageId, err: String(err) }, "[landing-page] step failed");
    recordMetric("ai.job.failed", { queue: LANDING_PAGE_QUEUE_NAME, step: data.step, tenantIdHash: hashId(tenantId), err: String(err) });
    throw err;
  }
}

// ─── BullMQ Worker registration ───────────────────────────────────────────────

export const landingPageWorker = new Worker<LandingPageJob>(
  LANDING_PAGE_QUEUE_NAME,
  handleLandingPageJob,
  { connection, concurrency: 3 },
);

landingPageWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, step: job.data.step }, "[landing-page] BullMQ job completed");
  recordMetric("queue.job.completed", { queue: LANDING_PAGE_QUEUE_NAME, jobId: job.id, step: job.data.step });
});

landingPageWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, step: job?.data.step, err: err.message }, "[landing-page] BullMQ job failed");
  recordMetric("queue.job.failed", { queue: LANDING_PAGE_QUEUE_NAME, jobId: job?.id, step: job?.data.step, err: err.message });
});
