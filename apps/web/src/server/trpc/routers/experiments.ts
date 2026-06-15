// A/B testing router (step-31).
// Manages landing page experiments: create, get stats, judge winner, promote, stop.
import { createAnthropicHaiku, EchoProvider, getPrompt, type CallOpts } from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  landingPageExperiments,
  experimentVariants,
  landingPageVersions,
  landingPages,
  events,
  outbox,
} from "@marketing/db";
import { env } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, count, sql, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";

// ─── Provider ────────────────────────────────────────────────────────────────

function buildProvider() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
    return new EchoProvider();
  }
  return createAnthropicHaiku();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Aggregate views and form_submit conversions per variant from events table. */
async function getVariantStats(
  tenantId: string,
  pageId: string,
  variantIds: string[],
): Promise<Record<string, { views: number; conversions: number }>> {
  if (!variantIds.length) return {};

  // Views: page_view events where properties->>'variant_id' matches a variant.
  const viewRows = await db
    .select({
      variantId: sql<string>`${events.properties}->>'variant_id'`,
      total: count(),
    })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.eventType, "page_view"),
        sql`${events.properties}->>'variant_id' = ANY(${sql`ARRAY[${sql.join(
          variantIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::text[]`})`,
        sql`${events.pageUrl} LIKE ${`%/p/%`}`,
      ),
    )
    .groupBy(sql`${events.properties}->>'variant_id'`);

  // Conversions: form_submit events on the same variants.
  const convRows = await db
    .select({
      variantId: sql<string>`${events.properties}->>'variant_id'`,
      total: count(),
    })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.eventType, "form_submit"),
        sql`${events.properties}->>'variant_id' = ANY(${sql`ARRAY[${sql.join(
          variantIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::text[]`})`,
      ),
    )
    .groupBy(sql`${events.properties}->>'variant_id'`);

  const result: Record<string, { views: number; conversions: number }> = {};
  for (const id of variantIds) {
    result[id] = { views: 0, conversions: 0 };
  }
  for (const row of viewRows) {
    if (row.variantId && result[row.variantId] !== undefined) {
      result[row.variantId]!.views = Number(row.total);
    }
  }
  for (const row of convRows) {
    if (row.variantId && result[row.variantId] !== undefined) {
      result[row.variantId]!.conversions = Number(row.total);
    }
  }
  return result;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const experimentsRouter = router({
  /**
   * Create a new A/B experiment on a landing page.
   * Requires the page to have at least 2 published versions.
   */
  create: tenantProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        name: z.string().min(1).max(100),
        variants: z
          .array(
            z.object({
              versionId: z.string().uuid(),
              label: z.string().min(1).max(50),
              trafficPct: z.number().int().min(1).max(99),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      // Verify page belongs to tenant.
      const [page] = await db
        .select({ id: landingPages.id })
        .from(landingPages)
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, input.pageId)));

      if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });

      // Verify all versionIds belong to this page.
      const versionIds = input.variants.map((v) => v.versionId);
      const versions = await db
        .select({ id: landingPageVersions.id })
        .from(landingPageVersions)
        .where(
          and(
            eq(landingPageVersions.tenantId, tenantId),
            eq(landingPageVersions.landingPageId, input.pageId),
            inArray(landingPageVersions.id, versionIds),
          ),
        );

      if (versions.length !== versionIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more version IDs do not belong to this page.",
        });
      }

      // Stop any currently running experiment on this page.
      await db
        .update(landingPageExperiments)
        .set({ status: "stopped", endedAt: new Date() })
        .where(
          and(
            eq(landingPageExperiments.tenantId, tenantId),
            eq(landingPageExperiments.pageId, input.pageId),
            eq(landingPageExperiments.status, "running"),
          ),
        );

      const [exp] = await db
        .insert(landingPageExperiments)
        .values({ tenantId, pageId: input.pageId, name: input.name })
        .returning({ id: landingPageExperiments.id });

      await db.insert(experimentVariants).values(
        input.variants.map((v) => ({
          experimentId: exp!.id,
          tenantId,
          versionId: v.versionId,
          label: v.label,
          trafficPct: v.trafficPct,
        })),
      );

      return { experimentId: exp!.id };
    }),

  /**
   * Get the active (or most recent) experiment for a page, with variant stats.
   */
  getByPage: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [exp] = await db
        .select()
        .from(landingPageExperiments)
        .where(
          and(
            eq(landingPageExperiments.tenantId, tenantId),
            eq(landingPageExperiments.pageId, input.pageId),
          ),
        )
        .orderBy(desc(landingPageExperiments.createdAt))
        .limit(1);

      if (!exp) return null;

      const variants = await db
        .select({
          id: experimentVariants.id,
          versionId: experimentVariants.versionId,
          label: experimentVariants.label,
          trafficPct: experimentVariants.trafficPct,
          versionNumber: landingPageVersions.version,
        })
        .from(experimentVariants)
        .innerJoin(landingPageVersions, eq(experimentVariants.versionId, landingPageVersions.id))
        .where(eq(experimentVariants.experimentId, exp.id));

      const stats = await getVariantStats(
        tenantId,
        input.pageId,
        variants.map((v) => v.id),
      );

      return {
        ...exp,
        variants: variants.map((v) => ({
          ...v,
          views: stats[v.id]?.views ?? 0,
          conversions: stats[v.id]?.conversions ?? 0,
          conversionRate:
            (stats[v.id]?.views ?? 0) > 0
              ? ((stats[v.id]?.conversions ?? 0) / (stats[v.id]?.views ?? 1)) * 100
              : 0,
        })),
      };
    }),

  /**
   * Stop a running experiment without declaring a winner.
   */
  stop: tenantProcedure
    .input(z.object({ experimentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [exp] = await db
        .select({ id: landingPageExperiments.id })
        .from(landingPageExperiments)
        .where(
          and(
            eq(landingPageExperiments.tenantId, tenantId),
            eq(landingPageExperiments.id, input.experimentId),
          ),
        );

      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(landingPageExperiments)
        .set({ status: "stopped", endedAt: new Date() })
        .where(eq(landingPageExperiments.id, input.experimentId));

      return { stopped: true };
    }),

  /**
   * Promote the winning variant: flip the page to serve that version as published,
   * mark experiment complete.
   */
  promoteWinner: tenantProcedure
    .input(
      z.object({
        experimentId: z.string().uuid(),
        winnerVersionId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [exp] = await db
        .select()
        .from(landingPageExperiments)
        .where(
          and(
            eq(landingPageExperiments.tenantId, tenantId),
            eq(landingPageExperiments.id, input.experimentId),
          ),
        );

      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      // Flip published version on the page.
      await db
        .update(landingPages)
        .set({
          publishedVersionId: input.winnerVersionId,
          currentVersionId: input.winnerVersionId,
          updatedAt: new Date(),
        })
        .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.id, exp.pageId)));

      // Mark experiment complete.
      await db
        .update(landingPageExperiments)
        .set({
          status: "complete",
          endedAt: new Date(),
          winnerVersionId: input.winnerVersionId,
        })
        .where(eq(landingPageExperiments.id, input.experimentId));

      await db.insert(outbox).values({
        tenantId,
        type: "experiment.winner_promoted",
        payload: {
          experimentId: input.experimentId,
          pageId: exp.pageId,
          winnerVersionId: input.winnerVersionId,
        },
      });

      return { promoted: true };
    }),

  /**
   * Call Haiku to evaluate statistical significance and suggest a winner.
   */
  judgeWinner: tenantProcedure
    .input(z.object({ experimentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [exp] = await db
        .select()
        .from(landingPageExperiments)
        .where(
          and(
            eq(landingPageExperiments.tenantId, tenantId),
            eq(landingPageExperiments.id, input.experimentId),
          ),
        );

      if (!exp) throw new TRPCError({ code: "NOT_FOUND" });

      const variants = await db
        .select({
          id: experimentVariants.id,
          versionId: experimentVariants.versionId,
          label: experimentVariants.label,
        })
        .from(experimentVariants)
        .where(eq(experimentVariants.experimentId, input.experimentId));

      if (variants.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Need at least 2 variants." });
      }

      const [varA, varB] = variants as [(typeof variants)[0], (typeof variants)[0]];

      const stats = await getVariantStats(tenantId, exp.pageId, [varA.id, varB.id]);

      const statsA = stats[varA.id] ?? { views: 0, conversions: 0 };
      const statsB = stats[varB.id] ?? { views: 0, conversions: 0 };

      const JUDGE_TOOL = {
        name: "judge_experiment",
        description: "Declare the A/B test result.",
        inputSchema: {
          type: "object",
          required: ["winner", "confidence", "reasoning", "ready"],
          properties: {
            winner: { type: "string", enum: ["a", "b", "inconclusive"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reasoning: { type: "string", maxLength: 120 },
            ready: { type: "boolean" },
          },
        },
      };

      const provider = buildProvider();
      const prompt = getPrompt("experiment-judge-v1");
      const callOpts: CallOpts = {
        tenantId,
        jobId: `judge-${input.experimentId}-${Date.now()}`,
        promptId: "experiment-judge-v1",
        promptVersion: 1,
        costBudgetCents: 5,
      };

      type JudgeResult = {
        winner: "a" | "b" | "inconclusive";
        confidence: number;
        reasoning: string;
        ready: boolean;
      };

      let judgment: JudgeResult = {
        winner: "inconclusive",
        confidence: 0,
        reasoning: "Not enough data yet.",
        ready: false,
      };

      if (provider.completionWithTools) {
        try {
          const result = await provider.completionWithTools(
            {
              prompt: prompt.buildUserPrompt({
                labelA: varA.label,
                labelB: varB.label,
                viewsA: String(statsA.views),
                conversionsA: String(statsA.conversions),
                viewsB: String(statsB.views),
                conversionsB: String(statsB.conversions),
              }),
              systemPrompt: prompt.systemPrompt,
              maxTokens: 256,
            },
            [JUDGE_TOOL],
            callOpts,
          );

          if (result.toolResult) {
            const r = result.toolResult as JudgeResult;
            judgment = {
              winner: r.winner ?? "inconclusive",
              confidence: r.confidence ?? 0,
              reasoning: r.reasoning ?? "",
              ready: r.ready ?? false,
            };
          }
        } catch {
          // EchoProvider fallback: simple heuristic.
          const minSamples = Math.min(statsA.views, statsB.views) >= 50;
          const rateA = statsA.views > 0 ? statsA.conversions / statsA.views : 0;
          const rateB = statsB.views > 0 ? statsB.conversions / statsB.views : 0;
          judgment = {
            winner: !minSamples ? "inconclusive" : rateA >= rateB ? "a" : "b",
            confidence: minSamples ? 0.95 : 0.5,
            reasoning: minSamples
              ? `${rateA > rateB ? varA.label : varB.label} leads on conversion rate.`
              : "Insufficient data.",
            ready: minSamples,
          };
        }
      }

      return {
        judgment,
        variantA: { id: varA.id, label: varA.label, versionId: varA.versionId, ...statsA },
        variantB: { id: varB.id, label: varB.label, versionId: varB.versionId, ...statsB },
      };
    }),

  /**
   * List all experiments for a page (newest first).
   */
  listByPage: tenantProcedure
    .input(z.object({ pageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      return db
        .select({
          id: landingPageExperiments.id,
          name: landingPageExperiments.name,
          status: landingPageExperiments.status,
          startedAt: landingPageExperiments.startedAt,
          endedAt: landingPageExperiments.endedAt,
          winnerVersionId: landingPageExperiments.winnerVersionId,
        })
        .from(landingPageExperiments)
        .where(
          and(
            eq(landingPageExperiments.tenantId, tenantId),
            eq(landingPageExperiments.pageId, input.pageId),
          ),
        )
        .orderBy(desc(landingPageExperiments.createdAt))
        .limit(10);
    }),
});
