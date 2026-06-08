import { db } from "@marketing/db";
import {
  tenants,
  aiUsage,
  users,
  businessProfiles,
  socialPosts,
  leads,
  subscriptions,
  tenantMetricsDaily,
} from "@marketing/db";
import { logger } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { authedProcedure, router } from "../trpc";

// ─── Super-admin guard ────────────────────────────────────────────────────────
// Ops procedures are gated to users with platformRole = 'super_admin'.
// This is NOT a tenant role — it is a platform-wide operator role.

const opsProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const [row] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, ctx.session.user.id));
  if (row?.platformRole !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requires super_admin platform role" });
  }
  return next({ ctx });
});

// ─── Monthly spend helper ─────────────────────────────────────────────────────

async function getMtdSpend(tenantId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.tenantId, tenantId), gte(aiUsage.createdAt, monthStart)));
  return parseFloat(row?.total ?? "0");
}

// ─── Retention metric types ───────────────────────────────────────────────────

type RetentionByVertical = Record<string, { d7: number; d30: number; d60: number }>;

type DesignPartner = {
  tenantId: string;
  name: string;
  slug: string;
  vertical: string;
  plan: string;
  trialStartAt: Date;
  firstPostAt: Date | null;
  firstPaidAt: Date | null;
  churnedAt: Date | null;
  activityDays: { date: string; postsGenerated: number; leadsCaptured: number }[];
};

// ─── Retention metrics helpers ────────────────────────────────────────────────

/** Returns the UTC date string N days after a base date: "YYYY-MM-DD". */
export function addDays(base: Date, n: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure function — no DB access.
 * Exported for unit testing (ADR-0016 §D1 conversion rate definition).
 */
export function computeConversionRate(
  partners: { trialStartAt: Date; firstPaidAt: Date | null }[],
  now = new Date(),
): { conversionRate: number; convertedCount: number; eligibleCount: number } {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const eligible = partners.filter((p) => p.trialStartAt < sevenDaysAgo);
  const converted = eligible.filter((p) => p.firstPaidAt !== null).length;
  return {
    eligibleCount: eligible.length,
    convertedCount: converted,
    conversionRate:
      eligible.length === 0 ? 0 : Math.round((converted / eligible.length) * 100),
  };
}

/**
 * Computes D7/D30/D60 retention percentages per vertical.
 * Denominator: tenants whose trial is old enough for the day to have elapsed.
 * Numerator: tenants with postsGenerated > 0 on exactly day N.
 *
 * TODO(Phase-9): replace per-tenant-per-day SELECTs with a single batched query:
 * WHERE (tenant_id, day_date) IN (...) — collapses N×3 round-trips to 1.
 * Safe to defer while cohort is < 20 tenants (15 queries max).
 */
async function computeRetention(
  partners: { tenantId: string; vertical: string; trialStartAt: Date }[],
): Promise<RetentionByVertical> {
  const result: RetentionByVertical = {};

  const verticals = [...new Set(partners.map((p) => p.vertical))];
  const now = new Date();

  for (const vertical of verticals) {
    const group = partners.filter((p) => p.vertical === vertical);

    const counts = { d7: { num: 0, den: 0 }, d30: { num: 0, den: 0 }, d60: { num: 0, den: 0 } };

    for (const p of group) {
      const daysSinceTrial = Math.floor(
        (now.getTime() - p.trialStartAt.getTime()) / 86_400_000,
      );

      for (const [key, n] of [["d7", 7], ["d30", 30], ["d60", 60]] as const) {
        if (daysSinceTrial < n + 1) continue; // too new — exclude from denominator
        counts[key].den++;

        const targetDate = addDays(p.trialStartAt, n);
        const [row] = await db
          .select({ posts: tenantMetricsDaily.postsGenerated })
          .from(tenantMetricsDaily)
          .where(
            and(
              eq(tenantMetricsDaily.tenantId, p.tenantId),
              eq(tenantMetricsDaily.dayDate, targetDate),
            ),
          );
        if ((row?.posts ?? 0) > 0) counts[key].num++;
      }
    }

    result[vertical] = {
      d7: counts.d7.den === 0 ? 0 : Math.round((counts.d7.num / counts.d7.den) * 100),
      d30: counts.d30.den === 0 ? 0 : Math.round((counts.d30.num / counts.d30.den) * 100),
      d60: counts.d60.den === 0 ? 0 : Math.round((counts.d60.num / counts.d60.den) * 100),
    };
  }

  return result;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const opsRouter = router({
  listTenants: opsProcedure.query(async () => {
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        status: tenants.status,
        suspended: tenants.suspended,
        erasedAt: tenants.erasedAt,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(tenants.createdAt);
    return rows;
  }),

  getTenantUsage: opsProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const mtdSpendUsd = await getMtdSpend(input.tenantId);
      return { tenantId: input.tenantId, mtdSpendUsd };
    }),

  suspendTenant: opsProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(tenants)
        .set({ suspended: true, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId));
      logger.info({ tenantId: input.tenantId }, "[ops] tenant suspended");
      return { ok: true };
    }),

  unsuspendTenant: opsProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db
        .update(tenants)
        .set({ suspended: false, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId));
      logger.info({ tenantId: input.tenantId }, "[ops] tenant unsuspended");
      return { ok: true };
    }),

  // ─── Retention metrics (ADR-0016) ──────────────────────────────────────────

  getRetentionMetrics: opsProcedure.query(async () => {
    // 1. Load all non-erased tenants with their business profile.
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        createdAt: tenants.createdAt,
        firstPostAt: tenants.firstPostAt,
        firstPaidAt: tenants.firstPaidAt,
        churnedAt: tenants.churnedAt,
        vertical: businessProfiles.vertical,
      })
      .from(tenants)
      .leftJoin(businessProfiles, eq(businessProfiles.tenantId, tenants.id))
      .where(isNull(tenants.erasedAt))
      .orderBy(tenants.createdAt);

    // 2. Load activity days for each tenant (last 90 days).
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const activityRows = await db
      .select({
        tenantId: tenantMetricsDaily.tenantId,
        date: tenantMetricsDaily.dayDate,
        postsGenerated: tenantMetricsDaily.postsGenerated,
        leadsCaptured: tenantMetricsDaily.leadsCaptured,
      })
      .from(tenantMetricsDaily)
      .where(gte(tenantMetricsDaily.dayDate, cutoffStr))
      .orderBy(tenantMetricsDaily.dayDate);

    // Group activity by tenantId.
    const activityByTenant = new Map<
      string,
      { date: string; postsGenerated: number; leadsCaptured: number }[]
    >();
    for (const r of activityRows) {
      const list = activityByTenant.get(r.tenantId) ?? [];
      list.push({ date: r.date, postsGenerated: r.postsGenerated, leadsCaptured: r.leadsCaptured });
      activityByTenant.set(r.tenantId, list);
    }

    // 3. Build design-partner list.
    const partners: DesignPartner[] = rows.map((r) => ({
      tenantId: r.id,
      name: r.name,
      slug: r.slug,
      vertical: r.vertical ?? "unknown",
      plan: r.plan,
      trialStartAt: r.createdAt,
      firstPostAt: r.firstPostAt ?? null,
      firstPaidAt: r.firstPaidAt ?? null,
      churnedAt: r.churnedAt ?? null,
      activityDays: activityByTenant.get(r.id) ?? [],
    }));

    // 4. Compute trial→paid conversion rate (ADR-0016 §D1).
    const { conversionRate, convertedCount, eligibleCount } =
      computeConversionRate(partners);

    // 5. Compute D7/D30/D60 retention per vertical (ADR-0016 §D1).
    const retentionByVertical = await computeRetention(
      partners.map((p) => ({
        tenantId: p.tenantId,
        vertical: p.vertical,
        trialStartAt: p.trialStartAt,
      })),
    );

    return {
      designPartners: partners,
      conversionRate,
      convertedCount,
      eligibleCount,
      retentionByVertical,
    };
  }),

  /**
   * Backfills tenant_metrics_daily from existing social_posts and leads rows.
   * Idempotent — safe to re-run; uses INSERT ... ON CONFLICT DO UPDATE with
   * the raw aggregated counts (not increments) so re-runs overwrite, not double.
   */
  backfillMetrics: opsProcedure.mutation(async () => {
    // Aggregate social_posts per (tenant_id, day).
    const postAggs = await db
      .select({
        tenantId: socialPosts.tenantId,
        dayDate: sql<string>`(${socialPosts.createdAt} AT TIME ZONE 'UTC')::date::text`,
        postsGenerated: sql<number>`COUNT(*)::int`,
      })
      .from(socialPosts)
      .where(eq(socialPosts.status, "completed"))
      .groupBy(socialPosts.tenantId, sql`(${socialPosts.createdAt} AT TIME ZONE 'UTC')::date`);

    // Aggregate leads per (tenant_id, day).
    const leadAggs = await db
      .select({
        tenantId: leads.tenantId,
        dayDate: sql<string>`(${leads.submittedAt} AT TIME ZONE 'UTC')::date::text`,
        leadsCaptured: sql<number>`COUNT(*)::int`,
      })
      .from(leads)
      .groupBy(leads.tenantId, sql`(${leads.submittedAt} AT TIME ZONE 'UTC')::date`);

    // Merge into a map keyed by "tenantId::dayDate".
    const merged = new Map<
      string,
      { tenantId: string; dayDate: string; postsGenerated: number; leadsCaptured: number }
    >();

    for (const r of postAggs) {
      const key = `${r.tenantId}::${r.dayDate}`;
      merged.set(key, {
        tenantId: r.tenantId,
        dayDate: r.dayDate,
        postsGenerated: r.postsGenerated,
        leadsCaptured: 0,
      });
    }
    for (const r of leadAggs) {
      const key = `${r.tenantId}::${r.dayDate}`;
      const existing = merged.get(key) ?? {
        tenantId: r.tenantId,
        dayDate: r.dayDate,
        postsGenerated: 0,
        leadsCaptured: 0,
      };
      existing.leadsCaptured = r.leadsCaptured;
      merged.set(key, existing);
    }

    if (merged.size === 0) return { upserted: 0 };

    // Resolve tenant vertical + plan for each tenant.
    const tenantIds = [...new Set([...merged.values()].map((r) => r.tenantId))];
    const profileRows = await db
      .select({ tenantId: businessProfiles.tenantId, vertical: businessProfiles.vertical })
      .from(businessProfiles)
      .where(
        sql`${businessProfiles.tenantId} = ANY(ARRAY[${sql.join(
          tenantIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])`,
      );
    const planRows = await db
      .select({ id: tenants.id, plan: tenants.plan })
      .from(tenants)
      .where(
        sql`${tenants.id} = ANY(ARRAY[${sql.join(
          tenantIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])`,
      );

    const verticalMap = new Map(profileRows.map((r) => [r.tenantId, r.vertical]));
    const planMap = new Map(planRows.map((r) => [r.id, r.plan]));

    const rows = [...merged.values()].map((r) => ({
      tenantId: r.tenantId,
      dayDate: r.dayDate,
      vertical: verticalMap.get(r.tenantId) ?? "unknown",
      postsGenerated: r.postsGenerated,
      leadsCaptured: r.leadsCaptured,
      plan: planMap.get(r.tenantId) ?? "trial",
    }));

    // Batch upsert in chunks of 100.
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await db
        .insert(tenantMetricsDaily)
        .values(chunk)
        .onConflictDoUpdate({
          target: [tenantMetricsDaily.tenantId, tenantMetricsDaily.dayDate],
          set: {
            postsGenerated: sql`EXCLUDED.posts_generated`,
            leadsCaptured: sql`EXCLUDED.leads_captured`,
            plan: sql`EXCLUDED.plan`,
            updatedAt: new Date(),
          },
        });
    }

    // Also backfill milestone timestamps on tenants.
    for (const tenantId of tenantIds) {
      const [firstPost] = await db
        .select({ createdAt: socialPosts.createdAt })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.status, "completed")))
        .orderBy(socialPosts.createdAt)
        .limit(1);

      if (firstPost) {
        await db
          .update(tenants)
          .set({ firstPostAt: firstPost.createdAt, updatedAt: new Date() })
          .where(and(eq(tenants.id, tenantId), isNull(tenants.firstPostAt)));
      }

      const [firstPaid] = await db
        .select({ createdAt: subscriptions.createdAt })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.tenantId, tenantId),
            eq(subscriptions.status, "active"),
            sql`${subscriptions.plan} != 'trial'`,
          ),
        )
        .orderBy(subscriptions.createdAt)
        .limit(1);

      if (firstPaid) {
        await db
          .update(tenants)
          .set({ firstPaidAt: firstPaid.createdAt, updatedAt: new Date() })
          .where(and(eq(tenants.id, tenantId), isNull(tenants.firstPaidAt)));
      }
    }

    logger.info({ upserted: rows.length }, "[ops] backfillMetrics complete");
    return { upserted: rows.length };
  }),
});
