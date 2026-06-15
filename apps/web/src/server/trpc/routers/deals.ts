// tRPC router for the deal pipeline (step-27).
// Stages are auto-seeded with 5 defaults per tenant on first listStages call.
// Amounts in whole CHF. AI summary is written by the nightly deal-summarize worker.
// Outbox events: deal.created, deal.stage_changed, deal.won, deal.lost.
import { db } from "@marketing/db";
import {
  contacts,
  dealActivities,
  deals,
  dealStages,
  DEFAULT_DEAL_STAGES,
  outbox,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";

// ─── Default stage seeding ────────────────────────────────────────────────────

async function ensureDefaultStages(tenantId: string): Promise<void> {
  const existing = await db
    .select({ id: dealStages.id })
    .from(dealStages)
    .where(eq(dealStages.tenantId, tenantId))
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(dealStages).values(DEFAULT_DEAL_STAGES.map((s) => ({ tenantId, ...s })));
}

async function assertContactBelongsToTenant(
  tenantId: string,
  contactId: string | null | undefined,
): Promise<void> {
  if (!contactId) return;

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

  if (!contact) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid contact." });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const dealsRouter = router({
  // List stages, creating defaults if none exist.
  listStages: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    await ensureDefaultStages(tenantId);
    return db
      .select()
      .from(dealStages)
      .where(eq(dealStages.tenantId, tenantId))
      .orderBy(asc(dealStages.order));
  }),

  // All open deals for the kanban, grouped by stage client-side.
  listByPipeline: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    await ensureDefaultStages(tenantId);

    const rows = await db
      .select({
        id: deals.id,
        title: deals.title,
        amountChf: deals.amountChf,
        expectedCloseDate: deals.expectedCloseDate,
        aiSummary: deals.aiSummary,
        status: deals.status,
        stageId: deals.stageId,
        wonAt: deals.wonAt,
        lostReason: deals.lostReason,
        createdAt: deals.createdAt,
        updatedAt: deals.updatedAt,
        contactId: deals.contactId,
        contactEmail: contacts.email,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(deals)
      .leftJoin(contacts, and(eq(contacts.id, deals.contactId), eq(contacts.tenantId, tenantId)))
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, "open")))
      .orderBy(desc(deals.createdAt));

    return rows;
  }),

  // Create a deal. stageId must belong to the tenant.
  create: tenantProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        stageId: z.string().uuid(),
        amountChf: z.number().int().min(0).default(0),
        contactId: z.string().uuid().optional(),
        expectedCloseDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      // Verify stage belongs to tenant.
      const [stage] = await db
        .select({ id: dealStages.id })
        .from(dealStages)
        .where(and(eq(dealStages.tenantId, tenantId), eq(dealStages.id, input.stageId)));
      if (!stage) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid stage." });

      await assertContactBelongsToTenant(tenantId, input.contactId);

      const [created] = await db
        .insert(deals)
        .values({
          tenantId,
          title: input.title,
          stageId: input.stageId,
          amountChf: input.amountChf,
          contactId: input.contactId ?? null,
          expectedCloseDate: input.expectedCloseDate ?? null,
        })
        .returning({ id: deals.id });

      // Emit outbox event for downstream automation.
      await db.insert(outbox).values({
        tenantId,
        type: "deal.created",
        payload: { dealId: created!.id, tenantId, title: input.title, stageId: input.stageId },
      });

      return created!;
    }),

  // Update deal fields (title, amount, expectedCloseDate, contactId).
  update: tenantProcedure
    .input(
      z.object({
        dealId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        amountChf: z.number().int().min(0).optional(),
        contactId: z.string().uuid().nullable().optional(),
        expectedCloseDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.amountChf !== undefined) patch.amountChf = input.amountChf;
      if (input.contactId !== undefined) patch.contactId = input.contactId;
      if (input.expectedCloseDate !== undefined) patch.expectedCloseDate = input.expectedCloseDate;

      if (input.contactId !== undefined) {
        await assertContactBelongsToTenant(tenantId, input.contactId);
      }

      await db
        .update(deals)
        .set(patch)
        .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId)));
    }),

  // Move a deal to a different stage (the core kanban action).
  moveStage: tenantProcedure
    .input(z.object({ dealId: z.string().uuid(), stageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [[deal], [stage]] = await Promise.all([
        db
          .select({ id: deals.id, stageId: deals.stageId, title: deals.title })
          .from(deals)
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId))),
        db
          .select({
            id: dealStages.id,
            label: dealStages.label,
            isWon: dealStages.isWon,
            isLost: dealStages.isLost,
          })
          .from(dealStages)
          .where(and(eq(dealStages.tenantId, tenantId), eq(dealStages.id, input.stageId))),
      ]);

      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      if (!stage) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid stage." });
      if (deal.stageId === input.stageId) return; // no-op

      await db.transaction(async (tx) => {
        await tx
          .update(deals)
          .set({ stageId: input.stageId, updatedAt: new Date() })
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId)));

        await tx.insert(dealActivities).values({
          dealId: input.dealId,
          tenantId,
          type: "stage_change",
          content: `Moved to "${stage.label}"`,
        });

        await tx.insert(outbox).values({
          tenantId,
          type: "deal.stage_changed",
          payload: {
            dealId: input.dealId,
            tenantId,
            newStageId: input.stageId,
            stageLabel: stage.label,
          },
        });
      });
    }),

  // Mark a deal as won.
  markWon: tenantProcedure
    .input(z.object({ dealId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      // Find the won stage.
      const [wonStage] = await db
        .select({ id: dealStages.id })
        .from(dealStages)
        .where(and(eq(dealStages.tenantId, tenantId), eq(dealStages.isWon, true)))
        .limit(1);

      await db.transaction(async (tx) => {
        await tx
          .update(deals)
          .set({
            status: "won",
            wonAt: new Date(),
            stageId: wonStage?.id ?? deals.stageId,
            updatedAt: new Date(),
          })
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId)));

        await tx.insert(dealActivities).values({
          dealId: input.dealId,
          tenantId,
          type: "stage_change",
          content: "Deal marked as Won 🎉",
        });

        await tx.insert(outbox).values({
          tenantId,
          type: "deal.won",
          payload: { dealId: input.dealId, tenantId },
        });
      });
    }),

  // Mark a deal as lost with an optional reason.
  markLost: tenantProcedure
    .input(z.object({ dealId: z.string().uuid(), reason: z.string().max(300).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [lostStage] = await db
        .select({ id: dealStages.id })
        .from(dealStages)
        .where(and(eq(dealStages.tenantId, tenantId), eq(dealStages.isLost, true)))
        .limit(1);

      await db.transaction(async (tx) => {
        await tx
          .update(deals)
          .set({
            status: "lost",
            lostReason: input.reason ?? null,
            stageId: lostStage?.id ?? deals.stageId,
            updatedAt: new Date(),
          })
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId)));

        await tx.insert(dealActivities).values({
          dealId: input.dealId,
          tenantId,
          type: "stage_change",
          content: `Deal marked as Lost${input.reason ? `: ${input.reason}` : ""}`,
        });

        await tx.insert(outbox).values({
          tenantId,
          type: "deal.lost",
          payload: { dealId: input.dealId, tenantId, reason: input.reason },
        });
      });
    }),

  // Add a note to a deal.
  addNote: tenantProcedure
    .input(z.object({ dealId: z.string().uuid(), content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      // Verify deal belongs to tenant.
      const [deal] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId)));
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });

      await db.insert(dealActivities).values({
        dealId: input.dealId,
        tenantId,
        type: "note",
        content: input.content,
      });

      // Update deal.updatedAt so the deal-summarize worker sees activity.
      await db
        .update(deals)
        .set({ updatedAt: new Date() })
        .where(and(eq(deals.tenantId, tenantId), eq(deals.id, input.dealId)));
    }),

  // Recent activities for a deal (newest first).
  getActivities: tenantProcedure
    .input(
      z.object({ dealId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      return db
        .select()
        .from(dealActivities)
        .where(and(eq(dealActivities.tenantId, tenantId), eq(dealActivities.dealId, input.dealId)))
        .orderBy(desc(dealActivities.createdAt))
        .limit(input.limit);
    }),

  // Pipeline forecast: stages with deal count + CHF value + won rate + avg days-to-close.
  getForecast: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    await ensureDefaultStages(tenantId);

    const stages = await db
      .select()
      .from(dealStages)
      .where(eq(dealStages.tenantId, tenantId))
      .orderBy(asc(dealStages.order));

    const pipeline = await Promise.all(
      stages
        .filter((s) => !s.isLost)
        .map(async (stage) => {
          const [agg] = await db
            .select({ total: count(), value: sum(deals.amountChf) })
            .from(deals)
            .where(
              and(
                eq(deals.tenantId, tenantId),
                eq(deals.stageId, stage.id),
                stage.isWon ? undefined : eq(deals.status, "open"),
              ),
            );
          return {
            stageId: stage.id,
            stageLabel: stage.label,
            isWon: stage.isWon,
            dealCount: agg?.total ?? 0,
            totalChf: Number(agg?.value ?? 0),
          };
        }),
    );

    // Win rate: won / (won + lost)
    const [wonCount] = await db
      .select({ total: count() })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, "won")));
    const [lostCount] = await db
      .select({ total: count() })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, "lost")));

    const won = wonCount?.total ?? 0;
    const lost = lostCount?.total ?? 0;
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

    // Average days to close (won deals only, approximate: updatedAt - createdAt).
    const [avgClose] = await db
      .select({
        avgDays: sql<number>`ROUND(AVG(EXTRACT(EPOCH FROM (${deals.updatedAt} - ${deals.createdAt})) / 86400))`,
      })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, "won")));

    return {
      pipeline,
      winRate,
      avgDaysToClose: avgClose?.avgDays ?? null,
      totalOpenChf: pipeline.filter((s) => !s.isWon).reduce((sum, s) => sum + s.totalChf, 0),
    };
  }),
});
