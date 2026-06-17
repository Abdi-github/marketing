// Landing-page FlowProducer worker — handles all 4 steps of the compose graph.
// Step order (bottom-up): brief → copy → layout → publish (ADR-0012).
// Each step is idempotent: if step_data already has the step's output, skip.
import { createHash } from "node:crypto";
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
  pickDesignRecipe,
  applyStyleContractToComposition,
  createLandingPageDesignPlan,
  designPlanSeed,
  enhanceCompositionWithWebsite,
  type EmbedStore,
  type SectionType,
  type LandingPageDesignPlan,
} from "@marketing/ai-router";
import { pickBundleForVertical, buildUnsplashUrl } from "@marketing/landing-design-system";
import { getPlanCaps, monthlyBudgetKey, BUDGET_KEY_TTL_SECONDS } from "@marketing/billing";
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
import { ingestRemoteImageToMediaAsset } from "../../lib/media-assets";
import { connection } from "../social-post/queue";

// ─── Locale-aware prompt selector ────────────────────────────────────────────
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
  if (locale === "en") {
    return {
      brief: "landing-page-brief-en-v1",
      copy: "landing-page-copy-en-v1",
      layout: "landing-page-layout-en-v1",
    };
  }
  if (locale === "fr-CH") {
    return {
      brief: "landing-page-brief-fr-v1",
      copy: "landing-page-copy-fr-v1",
      layout: "landing-page-layout-fr-v1",
    };
  }
  // de-CH default
  return {
    brief: "landing-page-brief-v1",
    copy: "landing-page-copy-v1",
    layout: "landing-page-layout-v1",
  };
}

function deriveUsageJobId(jobId: string, ...parts: string[]): string {
  const raw = createHash("sha256")
    .update([jobId, ...parts].join(":"))
    .digest("hex")
    .slice(0, 32)
    .split("");
  raw[12] = "5";
  raw[16] = (8 + (Number.parseInt(raw[16] ?? "0", 16) % 4)).toString(16);
  const hex = raw.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Default section set for free-form AI generation ─────────────────────────
// Free-form pages (no template) use this to get a rich section list instead of
// the bare minimum. Keyed by vertical keyword match so a café gets a menu section
// and a fitness studio gets an offer section automatically.
function defaultSectionsForVertical(vertical: string): string {
  const v = vertical.toLowerCase();
  if (/café|cafe|kaffee|coffee|barista|bakery|boulangerie|pâtisserie|brunch/.test(v))
    return "hero, menu_preview, about, gallery, testimonials, contact";
  if (/restaurant|gastro|bistro|trattoria|pizza|brasserie|dining|food|cuisine|ristorante/.test(v))
    return "hero, menu_preview, gallery, testimonials, about, contact";
  if (/gym|fitness|sport|crossfit|training|workout|yoga|pilates|wellness|spa/.test(v))
    return "hero, offer, about, gallery, testimonials, faq, contact, lead_form";
  if (/clinic|médecin|arzt|doctor|health|praxis|physio|osteo|chiro|dental/.test(v))
    return "hero, about, testimonials, faq, contact, lead_form";
  if (/boutique|fashion|mode|clothing|retail|store|shop|artisan|jewel/.test(v))
    return "hero, offer, gallery, testimonials, about, contact, lead_form";
  // Default: service / consulting / other
  return "hero, about, offer, testimonials, faq, contact, lead_form";
}

type LanguagePreferences = {
  locales: string[];
  defaultLocale: string;
};

type LocalizedCompositions = Record<string, LandingPageComposition>;

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
      and(eq(aiUsage.tenantId, tenantId), sql`${aiUsage.createdAt} >= ${monthStart.toISOString()}`),
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

type LandingGenerationControlState = "running" | "paused" | "cancelled" | "failed";

function getGenerationControlState(
  stepData: Record<string, unknown> | null | undefined,
): LandingGenerationControlState {
  const state = (stepData?.["generationControl"] as { state?: unknown } | undefined)?.state;
  return state === "paused" || state === "cancelled" || state === "failed" ? state : "running";
}

async function assertGenerationRunnable(
  ctx: TenantContext,
  pageId: string,
  step: LandingPageJob["step"],
) {
  const page = await getLandingPage(ctx, pageId);
  if (!page) {
    throw new UnrecoverableError(`Landing page ${pageId} was removed during ${step}`);
  }
  const state = getGenerationControlState(
    (page.stepData as Record<string, unknown> | null) ?? null,
  );
  if (state === "paused" || state === "cancelled" || state === "failed") {
    throw new UnrecoverableError(`Landing page ${pageId} is ${state}; aborting ${step}`);
  }
  return page;
}

async function updateStepData(
  ctx: TenantContext,
  pageId: string,
  stepKey: string,
  value: unknown,
): Promise<void> {
  await updateStepDataPatch(ctx, pageId, { [stepKey]: value });
}

async function updateStepDataPatch(
  ctx: TenantContext,
  pageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(landingPages)
    .set({
      stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, pageId)));
}

async function markLandingPageFailed(
  ctx: TenantContext,
  pageId: string,
  opts?: { reason?: string; step?: LandingPageJob["step"] },
): Promise<void> {
  const failurePatch = {
    generationControl: {
      state: "failed",
      failedAt: new Date().toISOString(),
      ...(opts?.reason ? { reason: opts.reason } : {}),
      ...(opts?.step ? { failedStep: opts.step } : {}),
    },
  };
  await db
    .update(landingPages)
    .set({
      status: "failed",
      stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify(failurePatch)}::jsonb`,
      updatedAt: new Date(),
    })
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
        .where(and(eq(brandEmbeddings.tenantId, tenantId), eq(brandEmbeddings.contentHash, hash)));
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

const LOCALIZE_COMPOSITION_TOOL = {
  name: "localize_landing_page",
  description: "Return translated/localized landing-page copy using the same composition shape.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      locale: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
            extras: { type: "object" },
          },
        },
      },
      site: { type: "object" },
    },
    required: ["title", "sections"],
  },
};

function localeName(locale: string): string {
  if (locale === "de-CH") return "Swiss High German for German-speaking Switzerland";
  if (locale === "fr-CH") return "Swiss French for Romandy";
  if (locale === "it-CH") return "Swiss Italian for Ticino";
  if (locale === "en") return "clear international English for Switzerland";
  return locale;
}

function normalizeLanguagePreferences(
  data: LandingPageJob,
  stepData: Record<string, unknown>,
): LanguagePreferences {
  const raw =
    data.languagePreferences ??
    (stepData["languagePreferences"] as LanguagePreferences | undefined);
  const locales = Array.from(
    new Set(
      (raw?.locales?.length ? raw.locales : [data.locale]).filter(
        (locale): locale is string => typeof locale === "string" && locale.length > 0,
      ),
    ),
  );
  if (locales.length === 0) locales.push(data.locale);
  const defaultLocale =
    raw?.defaultLocale && locales.includes(raw.defaultLocale)
      ? raw.defaultLocale
      : locales.includes(data.locale)
        ? data.locale
        : locales[0]!;
  return { locales, defaultLocale };
}

function shouldPreserveExtraString(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("url") ||
    k.includes("href") ||
    k.includes("email") ||
    k.includes("phone") ||
    k.includes("number") ||
    k.includes("embed") ||
    k.includes("price")
  );
}

function mergeLocalizedExtras(base: unknown, translated: unknown): unknown {
  if (!base || typeof base !== "object" || Array.isArray(base)) return base;
  const src = base as Record<string, unknown>;
  const tx =
    translated && typeof translated === "object" && !Array.isArray(translated)
      ? (translated as Record<string, unknown>)
      : {};
  const out: Record<string, unknown> = { ...src };

  for (const [key, value] of Object.entries(src)) {
    const next = tx[key];
    if (typeof value === "string") {
      out[key] = typeof next === "string" && !shouldPreserveExtraString(key) ? next : value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((item, index) =>
        mergeLocalizedExtras(item, Array.isArray(next) ? next[index] : undefined),
      );
    } else if (value && typeof value === "object") {
      out[key] = mergeLocalizedExtras(value, next);
    }
  }

  return out;
}

function mergeLocalizedComposition(
  base: LandingPageComposition,
  candidate: unknown,
  locale: string,
): LandingPageComposition | null {
  const raw =
    candidate && typeof candidate === "object" && "composition" in candidate
      ? (candidate as { composition?: unknown }).composition
      : candidate;
  if (!raw || typeof raw !== "object") return null;

  const tx = raw as Partial<LandingPageComposition>;
  const txSections = Array.isArray(tx.sections) ? tx.sections : [];
  const mergeSections = (
    baseSections: LandingPageComposition["sections"],
    translatedSections: unknown[],
  ) =>
    baseSections.map((section, index) => {
      const translated = translatedSections[index] as
        | { heading?: unknown; body?: unknown; extras?: unknown }
        | undefined;
      return {
        ...section,
        heading:
          typeof translated?.heading === "string" && translated.heading.trim()
            ? translated.heading
            : section.heading,
        body: typeof translated?.body === "string" ? translated.body : section.body,
        extras: mergeLocalizedExtras(section.extras, translated?.extras) as never,
      };
    });

  const txSite = tx.site;
  const site = base.site
    ? {
        ...base.site,
        nav: base.site.nav
          ? {
              ...base.site.nav,
              brandLabel:
                typeof txSite?.nav?.brandLabel === "string"
                  ? txSite.nav.brandLabel
                  : base.site.nav.brandLabel,
              links: base.site.nav.links.map((link, index) => ({
                ...link,
                label:
                  typeof txSite?.nav?.links?.[index]?.label === "string"
                    ? txSite.nav.links[index]!.label
                    : link.label,
              })),
              cta: base.site.nav.cta
                ? {
                    ...base.site.nav.cta,
                    label:
                      typeof txSite?.nav?.cta?.label === "string"
                        ? txSite.nav.cta.label
                        : base.site.nav.cta.label,
                  }
                : undefined,
            }
          : undefined,
        pages: base.site.pages?.map((page, pageIndex) => ({
          ...page,
          title:
            typeof txSite?.pages?.[pageIndex]?.title === "string"
              ? txSite.pages[pageIndex]!.title
              : page.title,
          description:
            typeof txSite?.pages?.[pageIndex]?.description === "string"
              ? txSite.pages[pageIndex]!.description
              : page.description,
          sections: mergeSections(page.sections, txSite?.pages?.[pageIndex]?.sections ?? []),
        })),
        footer: base.site.footer
          ? {
              ...base.site.footer,
              text:
                typeof txSite?.footer?.text === "string"
                  ? txSite.footer.text
                  : base.site.footer.text,
              links: base.site.footer.links?.map((link, index) => ({
                ...link,
                label:
                  typeof txSite?.footer?.links?.[index]?.label === "string"
                    ? txSite.footer.links[index]!.label
                    : link.label,
              })),
            }
          : undefined,
      }
    : undefined;

  const merged: LandingPageComposition = {
    ...base,
    locale,
    title: typeof tx.title === "string" && tx.title.trim() ? tx.title : base.title,
    sections: mergeSections(base.sections, txSections),
    site,
  };
  const parsed = landingPageCompositionSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
}

function rebuildLocalizedWebsiteShell(
  composition: LandingPageComposition,
  input: {
    data: LandingPageJob;
    stepData: Record<string, unknown>;
    jobId: string;
  },
  locale: string,
): LandingPageComposition {
  if (composition.site?.mode !== "website") return composition;

  const wizardPayload = input.stepData["wizardPayload"] as
    | {
        vibe?: Partial<{
          minimalBold: number;
          classicModern: number;
          calmEnergetic: number;
        }>;
        goals?: string[];
        goal?: string;
      }
    | undefined;
  const goals = wizardPayload?.goals ?? (wizardPayload?.goal ? [wizardPayload.goal] : []);
  const designPlan = input.stepData["designPlan"] as LandingPageDesignPlan | undefined;
  const rebuilt = enhanceCompositionWithWebsite(
    {
      ...composition,
      locale,
      site: undefined,
    },
    {
      businessName: input.data.businessName,
      vertical: input.data.vertical,
      city: input.data.city,
      locale,
      goals,
      vibe: wizardPayload?.vibe ?? null,
      seed: designPlan ? designPlanSeed(designPlan) : `${input.jobId}|${locale}`,
      navStyle: designPlan?.navStyle ?? composition.site.nav?.style ?? null,
      designPlan,
    },
  );

  return {
    ...composition,
    site: rebuilt.site,
  };
}

async function buildLocalizedCompositions(input: {
  ctx: TenantContext;
  data: LandingPageJob;
  composition: LandingPageComposition;
  stepData: Record<string, unknown>;
  tenantPlan: string;
  planCaps: ReturnType<typeof getPlanCaps>;
  jobId: string;
}): Promise<{
  localizedCompositions: LocalizedCompositions;
  localizedAiUsageIds: Record<string, string>;
}> {
  const preferences = normalizeLanguagePreferences(input.data, input.stepData);
  const sourceLocale = preferences.defaultLocale || input.data.locale || input.composition.locale;
  const localizedCompositions: LocalizedCompositions = {
    ...((input.stepData["localizedCompositions"] as LocalizedCompositions | undefined) ?? {}),
  };
  const localizedAiUsageIds: Record<string, string> = {
    ...((input.stepData["localizedAiUsageIds"] as Record<string, string> | undefined) ?? {}),
  };

  for (const locale of preferences.locales) {
    if (input.data.forceLocalization) {
      delete localizedCompositions[locale];
      delete localizedAiUsageIds[locale];
    }
    if (locale === sourceLocale || localizedCompositions[locale]) continue;

    let aiUsageId: string | undefined;
    try {
      const prompt = [
        `Translate and localize this generated Swiss SME website from ${localeName(sourceLocale)} to ${localeName(locale)}.`,
        "Keep the same structure, section count, section order, variants, image URLs, form behavior, slugs, hrefs, phone numbers, emails, prices, and map embeds.",
        "Translate visitor-facing text only: page title, headings, body copy, CTA labels, nav labels, footer labels, FAQ answers/questions, testimonials, captions, menu descriptions, and offer wording.",
        "Use natural local language, not literal machine translation. Avoid generic marketing cliches.",
        "",
        JSON.stringify(input.composition, null, 2),
      ].join("\n");

      const result = await getRouter().routeWithTools(
        {
          prompt,
          systemPrompt:
            "You localize landing-page composition JSON for Swiss SMEs. Return only the requested structured tool output. Preserve all non-text structure.",
          maxTokens: 3000,
          temperature: 0.2,
        },
        [LOCALIZE_COMPOSITION_TOOL],
        {
          tenantId: input.ctx.tenantId,
          jobId: deriveUsageJobId(input.jobId, "localize", locale),
          promptId: "landing-page-localize-v1",
          promptVersion: 1,
          costBudgetCents: input.planCaps.perJobBudgetCents,
        },
        {
          tenantPlan: input.tenantPlan,
          writeUsage: async (rec) => {
            aiUsageId = await insertAiUsage(rec);
            await incrementMonthlySpend(input.ctx.tenantId, rec.costUsd);
          },
        },
      );
      const merged = mergeLocalizedComposition(input.composition, result.toolResult, locale);
      if (merged) {
        localizedCompositions[locale] = rebuildLocalizedWebsiteShell(merged, input, locale);
        if (aiUsageId) localizedAiUsageIds[locale] = aiUsageId;
      } else {
        logger.warn(
          { jobId: input.jobId, locale },
          "[landing-page] localized composition failed validation; falling back to default language",
        );
      }
    } catch (err) {
      logger.warn(
        { jobId: input.jobId, locale, err: String(err) },
        "[landing-page] localization failed; falling back to default language",
      );
    }
  }

  return { localizedCompositions, localizedAiUsageIds };
}

// ─── Step handlers ────────────────────────────────────────────────────────────

async function handleBrief(
  ctx: TenantContext,
  data: LandingPageJob,
  tenantPlan: string,
  planCaps: ReturnType<typeof getPlanCaps>,
  jobId: string,
): Promise<void> {
  const page = await assertGenerationRunnable(ctx, data.landingPageId, "brief");

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  if (stepData["brief"]) {
    logger.info({ jobId, step: "brief" }, "[landing-page] brief already done — skipping");
    return;
  }

  // Retrieve relevant brand context for the prompt — only when the user opted in to
  // "apply my brand". Otherwise we keep the template's own voice + theme so the result
  // matches what the user previewed (no surprise colour/tone drift). See draftFromPrompt.
  const embedStore = makeEmbedStore(ctx);
  const primary = tenantPlan === "trial" ? createAnthropicHaiku() : createAnthropicSonnet();

  const brandChunks = data.applyBrand
    ? await findRelevantContext(ctx.tenantId, data.userPrompt, primary, embedStore, {
        jobId,
        costBudgetCents: 5,
      }).catch(() => [] as string[])
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
  const usageJobId = deriveUsageJobId(jobId, "brief");

  const result = await getRouter().route(
    {
      prompt: userPrompt,
      systemPrompt: prompt.systemPrompt,
      maxTokens: 600,
      temperature: 0.3,
    },
    {
      tenantId: ctx.tenantId,
      jobId: usageJobId,
      promptId: data.promptId,
      promptVersion: data.promptVersion,
      costBudgetCents: planCaps.perJobBudgetCents,
    },
    {
      tenantPlan,
      writeUsage: async (rec) => {
        aiUsageId = await insertAiUsage(rec);
        await incrementMonthlySpend(ctx.tenantId, rec.costUsd);
      },
    },
  );

  await assertGenerationRunnable(ctx, data.landingPageId, "brief");
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
  const page = await assertGenerationRunnable(ctx, data.landingPageId, "copy");

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  if (stepData["copy"]) {
    logger.info({ jobId, step: "copy" }, "[landing-page] copy already done — skipping");
    return;
  }

  const brief = (stepData["brief"] as { text: string } | undefined)?.text;
  if (!brief) throw new Error("Brief step output missing — cannot run copy step");

  // Template-seeded path: section structure fixed by the template.
  // Free-form path: AI determines sections from the brief.
  const templateSections = stepData["templateSections"] as
    | Array<{ type: string; order: number }>
    | undefined;
  const templateBrandHints = stepData["templateBrandHints"] as Record<string, string> | undefined;
  // LP-4: wizard payload (palette/font/vibe/goal) — informs copy tone & length.
  const wizardPayload = stepData["wizardPayload"] as
    | {
        paletteKey?: string;
        fontPairKey?: string;
        vibe?: {
          minimalBold: number;
          classicModern: number;
          calmEnergetic: number;
        };
        goal?: string;
        goals?: string[];
        imageStrategy?: string;
        siteMode?: "website" | "campaign";
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
        if (data.locale === "en") return "landing-page-personalize-en-v1";
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
    // Free-form (no template): use a vertical-appropriate section set.
    sectionsList = defaultSectionsForVertical(data.vertical ?? "");
    // Prefer the personalize prompt when the wizard vibe/goal is available.
    if (wizardPayload) {
      promptId = (() => {
        if (data.locale === "it-CH") return "landing-page-personalize-it-v1";
        if (data.locale === "en") return "landing-page-personalize-en-v1";
        if (data.locale === "fr-CH") return "landing-page-personalize-fr-v1";
        return "landing-page-personalize-v1";
      })();
    } else {
      promptId = landingPagePromptIds(data.locale).copy;
    }
  }

  // Compose brand hints: legacy template hints + wizard vibe + goal.
  const hintsParts: string[] = [];
  if (templateBrandHints) {
    if (templateBrandHints["tone"]) hintsParts.push(`Tone: ${templateBrandHints["tone"]}.`);
    if (templateBrandHints["colorHint"])
      hintsParts.push(`Colors: ${templateBrandHints["colorHint"]}.`);
  }
  if (wizardPayload?.vibe) {
    const v = wizardPayload.vibe;
    const vibeAdj = [
      Math.abs(v.minimalBold) < 0.2 ? null : v.minimalBold > 0 ? "bold" : "minimal",
      Math.abs(v.classicModern) < 0.2 ? null : v.classicModern > 0 ? "modern" : "classic",
      Math.abs(v.calmEnergetic) < 0.2 ? null : v.calmEnergetic > 0 ? "energetic" : "calm",
    ].filter(Boolean);
    if (vibeAdj.length > 0) hintsParts.push(`Vibe: ${vibeAdj.join(", ")}.`);
  }
  // Goals: support one or many. The primary goal leads; any extras are listed as secondary.
  const goalList = (
    wizardPayload?.goals && wizardPayload.goals.length > 0
      ? wizardPayload.goals
      : wizardPayload?.goal
        ? [wizardPayload.goal]
        : []
  ).map((g) => g.replace(/_/g, " "));
  if (goalList.length === 1) {
    hintsParts.push(`Primary goal: ${goalList[0]}.`);
  } else if (goalList.length > 1) {
    hintsParts.push(`Primary goal: ${goalList[0]}. Also support: ${goalList.slice(1).join(", ")}.`);
  }
  if (wizardPayload?.paletteKey) {
    hintsParts.push(`Palette: ${wizardPayload.paletteKey}.`);
  }
  if (wizardPayload?.siteMode === "campaign") {
    hintsParts.push("Site type: focused campaign landing page with one primary action.");
  } else if (wizardPayload?.siteMode === "website") {
    hintsParts.push("Site type: small business website with supporting pages.");
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
  const usageJobId = deriveUsageJobId(jobId, "copy");

  const result = await getRouter().routeWithTools(
    {
      prompt: userPrompt,
      systemPrompt: prompt.systemPrompt,
      maxTokens: 1500,
      temperature: 0.4,
    },
    [GENERATE_SECTIONS_TOOL],
    {
      tenantId: ctx.tenantId,
      jobId: usageJobId,
      promptId: data.promptId,
      promptVersion: data.promptVersion,
      costBudgetCents: planCaps.perJobBudgetCents,
    },
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

  await assertGenerationRunnable(ctx, data.landingPageId, "copy");
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
  const page = await assertGenerationRunnable(ctx, data.landingPageId, "layout");

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
  const usageJobId = deriveUsageJobId(jobId, "layout");

  const result = await getRouter().routeWithTools(
    {
      prompt: userPrompt,
      systemPrompt: prompt.systemPrompt,
      maxTokens: 2000,
      temperature: 0,
    },
    [COMPOSE_LAYOUT_TOOL],
    {
      tenantId: ctx.tenantId,
      jobId: usageJobId,
      promptId: data.promptId,
      promptVersion: data.promptVersion,
      costBudgetCents: planCaps.perJobBudgetCents,
    },
    {
      tenantPlan,
      writeUsage: async (rec) => {
        aiUsageId = await insertAiUsage(rec);
        await incrementMonthlySpend(ctx.tenantId, rec.costUsd);
      },
    },
  );

  const rawComposition = result.toolResult ?? {
    title: data.businessName,
    sections: [],
  };

  // Validate + coerce against the schema; fall back gracefully if malformed.
  const parseResult = landingPageCompositionSchema.safeParse(rawComposition);
  let composition: LandingPageComposition = parseResult.success
    ? parseResult.data
    : {
        title: data.businessName,
        locale: data.locale,
        sections: [
          {
            type: "hero",
            order: 0,
            heading: data.businessName,
            body: data.userPrompt,
          },
          { type: "lead_form", order: 1, heading: "Kontakt" },
        ],
      };
  composition = { ...composition, locale: data.locale };

  // LP-4 follow-up: FLUX image gen for the hero background.
  // Triggers when the wizard selected `imageStrategy: "ai"` AND REPLICATE_API_TOKEN is configured.
  // Failures are non-fatal — the composition still publishes with the AI-suggested URL or empty.
  const wizardPayload = stepData["wizardPayload"] as
    | {
        imageStrategy?: string;
        vibe?: {
          minimalBold: number;
          classicModern: number;
          calmEnergetic: number;
        };
        goals?: string[];
        goal?: string;
        brief?: string;
        siteMode?: "website" | "campaign";
      }
    | undefined;

  const goals = wizardPayload?.goals ?? (wizardPayload?.goal ? [wizardPayload.goal] : []);
  const designPlan =
    (stepData["designPlan"] as LandingPageDesignPlan | undefined) ??
    createLandingPageDesignPlan({
      tenantId: ctx.tenantId,
      landingPageId: data.landingPageId,
      businessName: data.businessName,
      vertical: data.vertical,
      city: data.city,
      locale: data.locale,
      userPrompt: wizardPayload?.brief ?? data.userPrompt,
      goals,
      vibe: wizardPayload?.vibe ?? null,
      imageStrategy: wizardPayload?.imageStrategy ?? null,
      templateKey: data.templateKey ?? null,
    });
  const recipeSeed = designPlanSeed(designPlan);

  await assertGenerationRunnable(ctx, data.landingPageId, "layout");

  // ADR-0029: apply a cohesive design recipe so AI pages aren't all the default layout.
  // Assign a variant to every section based on vibe + goals + a per-page seed, and give
  // palette-less pages a real theme instead of the purple fallback. Template-seeded sections
  // that already carry a variant are left untouched.
  {
    const recipe = pickDesignRecipe({
      vibe: wizardPayload?.vibe ?? null,
      goals,
      seed: recipeSeed,
      sectionTypes: composition.sections.map((s) => s.type),
      designPlan,
    });
    composition = {
      ...composition,
      sections: composition.sections.map((s) =>
        s.variant
          ? s
          : {
              ...s,
              variant: recipe.variants[s.type as SectionType] ?? undefined,
            },
      ),
    };
    const themePatch: Record<string, string> = { themeFontPair: recipe.fontPairKey };
    if (wizardPayload) themePatch["styleEra"] = designPlan.styleContract.era;
    if (!page.themeKey) {
      await db
        .update(landingPages)
        .set({
          themeKey: recipe.paletteKey,
          stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify(themePatch)}::jsonb`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, data.landingPageId)),
        );
    } else if (wizardPayload) {
      await db
        .update(landingPages)
        .set({
          stepData: sql`COALESCE(${landingPages.stepData}, '{}'::jsonb) || ${JSON.stringify(themePatch)}::jsonb`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(landingPages.tenantId, ctx.tenantId), eq(landingPages.id, data.landingPageId)),
        );
    }
  }

  // Auto-inject curated Unsplash images for sections that need visuals but have
  // none yet. Skipped if FLUX ai-strategy already placed a backgroundImageUrl.
  {
    const bundle = pickBundleForVertical(data.vertical ?? "");
    const heroPhotos = bundle.photos.filter((p) => p.role === "hero");
    const lifestyle = bundle.photos.filter((p) => p.role === "lifestyle");
    const gallerySet = bundle.photos.filter((p) => p.role === "gallery").slice(0, 6);

    composition = {
      ...composition,
      sections: composition.sections.map((s) => {
        if (s.type === "hero") {
          const heroExtras = s.extras as { backgroundImageUrl?: string } | undefined;
          if (!heroExtras?.backgroundImageUrl) {
            const photo = heroPhotos[0] ?? bundle.photos[0];
            if (photo) {
              return {
                ...s,
                extras: {
                  ...(s.extras ?? {}),
                  backgroundImageUrl: buildUnsplashUrl(photo.id, {
                    width: 1920,
                    quality: 85,
                  }),
                },
              };
            }
          }
        }
        if (s.type === "about") {
          const aboutExtras = s.extras as { imageUrl?: string } | undefined;
          if (!aboutExtras?.imageUrl) {
            const photo = lifestyle[0] ?? bundle.photos.find((p) => p.role !== "hero");
            if (photo) {
              return {
                ...s,
                extras: {
                  ...(s.extras ?? {}),
                  imageUrl: buildUnsplashUrl(photo.id, {
                    width: 1200,
                    quality: 80,
                  }),
                },
              };
            }
          }
        }
        if (s.type === "gallery") {
          const galleryExtras = s.extras as
            | { images?: { url: string; caption?: string }[] }
            | undefined;
          const existing = galleryExtras?.images ?? [];
          const hasRealImages = existing.some((img) => !!img.url);
          if (!hasRealImages && gallerySet.length > 0) {
            return {
              ...s,
              extras: {
                ...(s.extras ?? {}),
                images: gallerySet.map((p) => ({
                  url: buildUnsplashUrl(p.id, { width: 900, quality: 80 }),
                  caption: p.caption,
                })),
              },
            };
          }
        }
        return s;
      }),
    };
  }

  composition = applyStyleContractToComposition({
    composition,
    designPlan,
    seed: recipeSeed,
  });

  if (wizardPayload?.imageStrategy === "ai" && env.REPLICATE_API_TOKEN) {
    try {
      composition = await generateHeroImage(composition, data, ctx, jobId, planCaps);
    } catch (err) {
      logger.warn(
        { jobId, err: String(err) },
        "[landing-page] FLUX hero image gen failed — continuing without",
      );
    }
  }

  if (wizardPayload && wizardPayload.siteMode !== "campaign") {
    composition = enhanceCompositionWithWebsite(composition, {
      businessName: data.businessName,
      vertical: data.vertical,
      city: data.city,
      locale: data.locale,
      goals,
      vibe: wizardPayload?.vibe ?? null,
      seed: recipeSeed,
      navStyle: designPlan.navStyle,
      designPlan,
    });
  }

  const { localizedCompositions, localizedAiUsageIds } = await buildLocalizedCompositions({
    ctx,
    data,
    composition,
    stepData,
    tenantPlan,
    planCaps,
    jobId,
  });

  await assertGenerationRunnable(ctx, data.landingPageId, "layout");
  await updateStepDataPatch(ctx, data.landingPageId, {
    designPlan,
    uniquenessFingerprint: designPlan.uniquenessFingerprint,
    localizedCompositions,
    localizedAiUsageIds,
    layout: {
      composition,
      aiUsageId: aiUsageId!,
    },
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
  ]
    .filter(Boolean)
    .join(" ");

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
  const durableImage = await ingestRemoteImageToMediaAsset({
    tenantId: ctx.tenantId,
    scope: "section-image",
    sourceUrl: imageResult.url,
    originalFilenameBase: `landing-hero-${data.landingPageId}`,
    storageKeyPrefix: `generated/landing-heroes/${ctx.tenantId}`,
  });

  logger.info(
    { jobId, costUsd: imageResult.costUsd, model: imageResult.model },
    "[landing-page] FLUX hero image generated",
  );

  // Record the image gen cost in ai_usage with a deterministic UUID so it does
  // not collide with the layout step's own ai_usage row.
  await insertAiUsage({
    tenantId: ctx.tenantId,
    provider: imageResult.provider,
    model: imageResult.model,
    promptId: "landing-page-image-gen-v1",
    promptVersion: 1,
    jobId: deriveUsageJobId(jobId, "image-gen"),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: imageResult.costUsd,
  });
  await incrementMonthlySpend(ctx.tenantId, imageResult.costUsd);

  // Mutate the composition's hero section.
  const newSections = [...composition.sections];
  const newHero = {
    ...hero,
    extras: { ...(hero.extras ?? {}), backgroundImageUrl: durableImage.publicUrl },
  } as typeof hero;
  newSections[heroIdx] = newHero;
  return { ...composition, sections: newSections };
}

async function handlePublish(
  ctx: TenantContext,
  data: LandingPageJob,
  jobId: string,
): Promise<void> {
  const page = await assertGenerationRunnable(ctx, data.landingPageId, "publish");

  if (page.status === "published" && page.currentVersionId) {
    logger.info({ jobId, step: "publish" }, "[landing-page] already published — skipping");
    return;
  }

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  const layout = stepData["layout"] as
    | { composition: LandingPageComposition; aiUsageId: string }
    | undefined;
  if (!layout) throw new Error("Layout step output missing — cannot publish");

  await assertGenerationRunnable(ctx, data.landingPageId, "publish");

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

  logger.info(
    { jobId, landingPageId: data.landingPageId, versionId },
    "[landing-page] draft created",
  );
}

async function handleLocalize(
  ctx: TenantContext,
  data: LandingPageJob,
  tenantPlan: string,
  planCaps: ReturnType<typeof getPlanCaps>,
  jobId: string,
): Promise<void> {
  const page = await assertGenerationRunnable(ctx, data.landingPageId, "localize");
  if (!page.currentVersionId) {
    throw new Error("Current version missing — cannot localize landing page");
  }

  const [version] = await db
    .select({ composition: landingPageVersions.composition })
    .from(landingPageVersions)
    .where(
      and(
        eq(landingPageVersions.tenantId, ctx.tenantId),
        eq(landingPageVersions.id, page.currentVersionId),
      ),
    );
  if (!version) throw new Error("Current version missing — cannot localize landing page");

  const parsed = landingPageCompositionSchema.safeParse(version.composition);
  if (!parsed.success) {
    throw new Error("Current landing-page composition failed validation");
  }

  const stepData = (page.stepData ?? {}) as Record<string, unknown>;
  await updateStepDataPatch(ctx, data.landingPageId, {
    localizationStatus: {
      state: "processing",
      requestedLocales: normalizeLanguagePreferences(data, stepData).locales,
      updatedAt: new Date().toISOString(),
    },
  });

  const { localizedCompositions, localizedAiUsageIds } = await buildLocalizedCompositions({
    ctx,
    data,
    composition: parsed.data,
    stepData,
    tenantPlan,
    planCaps,
    jobId,
  });

  await assertGenerationRunnable(ctx, data.landingPageId, "localize");
  await updateStepDataPatch(ctx, data.landingPageId, {
    localizedCompositions,
    localizedAiUsageIds,
    localizationStatus: {
      state: "done",
      requestedLocales: normalizeLanguagePreferences(data, stepData).locales,
      updatedAt: new Date().toISOString(),
    },
  });
}

// ─── Main job handler ─────────────────────────────────────────────────────────

export async function handleLandingPageJob(job: Job<LandingPageJob>): Promise<void> {
  const data = landingPageJobSchema.parse(job.data);
  const { tenantId, landingPageId } = data;
  const jobId = job.id ?? data.idempotencyKey;

  const ctx: TenantContext = { tenantId, userId: data.userId, role: "owner" };

  const tenantPlan = await getTenantPlan(ctx);
  const planCaps = getPlanCaps(tenantPlan);

  await assertGenerationRunnable(ctx, landingPageId, data.step);

  // ─── Suspension pre-check ────────────────────────────────────────────────
  const [tenantRow] = await db
    .select({ suspended: tenants.suspended })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (tenantRow?.suspended) {
    await markLandingPageFailed(ctx, landingPageId, {
      reason: "Generation stopped because this tenant is suspended.",
      step: data.step,
    });
    logger.warn({ tenantId }, "[landing-page] tenant suspended — aborting");
    throw new UnrecoverableError(`Tenant ${tenantId} is suspended`);
  }

  // Monthly budget pre-check (skip for publish step — no AI call).
  if (data.step !== "publish") {
    const monthlySpend = await getMonthlySpend(tenantId);
    if (monthlySpend >= planCaps.monthlyAiBudgetUsd) {
      if (data.step === "localize") {
        await updateStepDataPatch(ctx, landingPageId, {
          localizationStatus: {
            state: "failed",
            requestedLocales: data.languagePreferences?.locales ?? [data.locale],
            updatedAt: new Date().toISOString(),
          },
        }).catch(() => null);
      } else {
        await markLandingPageFailed(ctx, landingPageId, {
          reason: `Monthly AI budget exceeded (${tenantPlan}: USD ${planCaps.monthlyAiBudgetUsd.toFixed(2)}). Upgrade your plan or wait until next month to generate a new page.`,
          step: data.step,
        });
      }
      logger.warn(
        {
          tenantId,
          tenantPlan,
          monthlySpend,
          cap: planCaps.monthlyAiBudgetUsd,
          step: data.step,
        },
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
      case "localize":
        await handleLocalize(ctx, data, tenantPlan, planCaps, jobId);
        break;
      case "publish":
        await handlePublish(ctx, data, jobId);
        break;
    }

    logger.info({ jobId, step: data.step, landingPageId }, "[landing-page] step completed");
    recordMetric("ai.job.completed", {
      queue: LANDING_PAGE_QUEUE_NAME,
      step: data.step,
      tenantIdHash: hashId(tenantId),
    });
  } catch (err) {
    // Localization is additive; a translation failure should not break the usable draft.
    if (data.step === "localize") {
      await updateStepDataPatch(ctx, landingPageId, {
        localizationStatus: {
          state: "failed",
          requestedLocales: data.languagePreferences?.locales ?? [data.locale],
          updatedAt: new Date().toISOString(),
        },
      }).catch(() => null);
    } else if (!(err instanceof UnrecoverableError)) {
      // Only mark page failed on non-budget errors (budget errors already marked above).
      await markLandingPageFailed(ctx, landingPageId, {
        reason: err instanceof Error ? err.message : "Landing page generation failed.",
        step: data.step,
      }).catch(() => null);
    }
    logger.error(
      { jobId, step: data.step, landingPageId, err: String(err) },
      "[landing-page] step failed",
    );
    recordMetric("ai.job.failed", {
      queue: LANDING_PAGE_QUEUE_NAME,
      step: data.step,
      tenantIdHash: hashId(tenantId),
      err: String(err),
    });
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
  recordMetric("queue.job.completed", {
    queue: LANDING_PAGE_QUEUE_NAME,
    jobId: job.id,
    step: job.data.step,
  });
});

landingPageWorker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, step: job?.data.step, err: err.message },
    "[landing-page] BullMQ job failed",
  );
  recordMetric("queue.job.failed", {
    queue: LANDING_PAGE_QUEUE_NAME,
    jobId: job?.id,
    step: job?.data.step,
    err: err.message,
  });
});
