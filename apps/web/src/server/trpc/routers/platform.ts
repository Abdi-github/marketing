import {
  aiUsage,
  brandAssets,
  businessProfiles,
  contacts,
  customDomains,
  db,
  forms,
  integrationConnections,
  integrationSyncRuns,
  invoices,
  landingPages,
  platformAuditLogs,
  sessions,
  socialPosts,
  subscriptions,
  supportSessions,
  tenantMetricsDaily,
  tenantSupportNotes,
  tenantUsers,
  tenants,
  users,
  type PlatformRole,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, ilike, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { canAccessPlatformSection, isPlatformRole } from "../../../lib/platform-access";
import { writePlatformAuditLog } from "../../platform/audit";
import { authedProcedure, router } from "../trpc";

const platformProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const role = ctx.session.user.platformRole;
  if (!isPlatformRole(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requires platform access" });
  }

  return next({
    ctx: {
      ...ctx,
      platformRole: role,
    },
  });
});

function sectionProcedure(
  section:
    | "overview"
    | "tenants"
    | "users"
    | "billing"
    | "aiJobs"
    | "integrations"
    | "domains"
    | "support"
    | "audit"
    | "health",
) {
  return platformProcedure.use(({ ctx, next }) => {
    if (!canAccessPlatformSection(ctx.platformRole, section)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires ${section} platform access`,
      });
    }
    return next({ ctx });
  });
}

async function getTenantCounts(tenantId: string) {
  const [[formsRow], [contactsRow], [pagesRow], [domainsRow], [integrationRow], [dealsRow]] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(forms)
        .where(eq(forms.tenantId, tenantId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.tenantId, tenantId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(landingPages)
        .where(eq(landingPages.tenantId, tenantId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(customDomains)
        .where(
          and(eq(customDomains.tenantId, tenantId), sql`${customDomains.status} != 'removed'`),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationConnections)
        .where(eq(integrationConnections.tenantId, tenantId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(socialPosts)
        .where(eq(socialPosts.tenantId, tenantId)),
    ]);

  return {
    formsCount: formsRow?.count ?? 0,
    contactsCount: contactsRow?.count ?? 0,
    pagesCount: pagesRow?.count ?? 0,
    domainsCount: domainsRow?.count ?? 0,
    integrationsCount: integrationRow?.count ?? 0,
    aiArtifactsCount: dealsRow?.count ?? 0,
  };
}

async function getTenantMtdAiSpend(tenantId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.tenantId, tenantId), gte(aiUsage.createdAt, monthStart)));
  return Number.parseFloat(row?.total ?? "0");
}

async function ensureAnotherSuperAdminIfRemoving(userId: string, nextRole: PlatformRole | null) {
  const [target] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, userId));
  if (target?.platformRole !== "super_admin" || nextRole === "super_admin") {
    return;
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.platformRole, "super_admin"));

  if ((row?.count ?? 0) <= 1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "You cannot remove the last active super admin.",
    });
  }
}

export const platformRouter = router({
  overview: sectionProcedure("overview").query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [
      [tenantTotal],
      [suspendedTotal],
      [platformUsersTotal],
      [activeSessionsTotal],
      [mtdAiCost],
      [liveDomainsTotal],
      [activeSupportTotal],
      [failedSyncTotal],
      [activeSubscriptionsTotal],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(tenants),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tenants)
        .where(eq(tenants.suspended, true)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(isNotNull(users.platformRole)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sessions)
        .where(gte(sessions.updatedAt, sevenDaysAgo)),
      db
        .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, monthStart)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(customDomains)
        .where(eq(customDomains.status, "live")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(supportSessions)
        .where(eq(supportSessions.status, "active")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationSyncRuns)
        .where(
          and(
            eq(integrationSyncRuns.status, "error"),
            gte(integrationSyncRuns.createdAt, sevenDaysAgo),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(eq(subscriptions.status, "active")),
    ]);

    const recentTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        suspended: tenants.suspended,
        createdAt: tenants.createdAt,
        vertical: businessProfiles.vertical,
      })
      .from(tenants)
      .leftJoin(businessProfiles, eq(businessProfiles.tenantId, tenants.id))
      .orderBy(desc(tenants.createdAt))
      .limit(8);

    await writePlatformAuditLog({
      actorId: ctx.session.user.id,
      actorPlatformRole: ctx.platformRole,
      action: "platform.overview.viewed",
      resourceType: "platform_dashboard",
    });

    return {
      totals: {
        tenants: tenantTotal?.count ?? 0,
        suspendedTenants: suspendedTotal?.count ?? 0,
        platformUsers: platformUsersTotal?.count ?? 0,
        activeSessions7d: activeSessionsTotal?.count ?? 0,
        mtdAiCostUsd: Number.parseFloat(mtdAiCost?.total ?? "0"),
        liveDomains: liveDomainsTotal?.count ?? 0,
        activeSupportSessions: activeSupportTotal?.count ?? 0,
        failedSyncs7d: failedSyncTotal?.count ?? 0,
        activeSubscriptions: activeSubscriptionsTotal?.count ?? 0,
      },
      recentTenants,
    };
  }),

  listTenants: sectionProcedure("tenants")
    .input(
      z.object({
        query: z.string().trim().optional(),
        status: z.enum(["all", "active", "under_review", "suspended"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(50).default(12),
      }),
    )
    .query(async ({ input }) => {
      const filters = [];
      if (input.query) {
        filters.push(
          or(ilike(tenants.name, `%${input.query}%`), ilike(tenants.slug, `%${input.query}%`)),
        );
      }
      if (input.status === "suspended") {
        filters.push(eq(tenants.suspended, true));
      } else if (input.status === "active") {
        filters.push(and(eq(tenants.suspended, false), eq(tenants.status, "active")));
      } else if (input.status === "under_review") {
        filters.push(eq(tenants.status, "under_review"));
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
            plan: tenants.plan,
            status: tenants.status,
            suspended: tenants.suspended,
            createdAt: tenants.createdAt,
            vertical: businessProfiles.vertical,
            locale: businessProfiles.locale,
          })
          .from(tenants)
          .leftJoin(businessProfiles, eq(businessProfiles.tenantId, tenants.id))
          .where(whereClause)
          .orderBy(desc(tenants.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tenants)
          .leftJoin(businessProfiles, eq(businessProfiles.tenantId, tenants.id))
          .where(whereClause),
      ]);

      return {
        items: rows,
        page: input.page,
        pageSize: input.pageSize,
        total: totalRow?.count ?? 0,
      };
    }),

  getTenantDetail: sectionProcedure("tenants")
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [tenant] = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          plan: tenants.plan,
          status: tenants.status,
          suspended: tenants.suspended,
          createdAt: tenants.createdAt,
          firstPostAt: tenants.firstPostAt,
          firstPaidAt: tenants.firstPaidAt,
          churnedAt: tenants.churnedAt,
          vertical: businessProfiles.vertical,
          locale: businessProfiles.locale,
          businessName: businessProfiles.businessName,
          city: businessProfiles.addressCity,
          primaryColor: brandAssets.colorPrimary,
          secondaryColor: brandAssets.colorSecondary,
          logoUrl: brandAssets.logoUrl,
        })
        .from(tenants)
        .leftJoin(businessProfiles, eq(businessProfiles.tenantId, tenants.id))
        .leftJoin(brandAssets, eq(brandAssets.tenantId, tenants.id))
        .where(eq(tenants.id, input.tenantId));

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
      }

      const [
        members,
        recentAiUsage,
        recentSyncs,
        domains,
        notes,
        auditTrail,
        [subscription],
        [latestInvoice],
        [metricsLatest],
        counts,
        mtdAiSpendUsd,
      ] = await Promise.all([
        db
          .select({
            userId: tenantUsers.userId,
            role: tenantUsers.role,
            joinedAt: tenantUsers.joinedAt,
            email: users.email,
            name: users.name,
          })
          .from(tenantUsers)
          .innerJoin(users, eq(users.id, tenantUsers.userId))
          .where(eq(tenantUsers.tenantId, input.tenantId))
          .orderBy(tenantUsers.joinedAt),
        db
          .select({
            id: aiUsage.id,
            jobId: aiUsage.jobId,
            provider: aiUsage.provider,
            model: aiUsage.model,
            promptId: aiUsage.promptId,
            costUsd: aiUsage.costUsd,
            createdAt: aiUsage.createdAt,
          })
          .from(aiUsage)
          .where(eq(aiUsage.tenantId, input.tenantId))
          .orderBy(desc(aiUsage.createdAt))
          .limit(10),
        db
          .select({
            id: integrationSyncRuns.id,
            provider: integrationSyncRuns.provider,
            status: integrationSyncRuns.status,
            source: integrationSyncRuns.source,
            recordsProcessed: integrationSyncRuns.recordsProcessed,
            errorMessage: integrationSyncRuns.errorMessage,
            createdAt: integrationSyncRuns.createdAt,
          })
          .from(integrationSyncRuns)
          .where(eq(integrationSyncRuns.tenantId, input.tenantId))
          .orderBy(desc(integrationSyncRuns.createdAt))
          .limit(8),
        db
          .select({
            id: customDomains.id,
            hostname: customDomains.hostname,
            status: customDomains.status,
            isPrimary: customDomains.isPrimary,
            certExpiresAt: customDomains.certExpiresAt,
          })
          .from(customDomains)
          .where(eq(customDomains.tenantId, input.tenantId))
          .orderBy(desc(customDomains.createdAt)),
        db
          .select({
            id: tenantSupportNotes.id,
            kind: tenantSupportNotes.kind,
            body: tenantSupportNotes.body,
            createdAt: tenantSupportNotes.createdAt,
            authorName: users.name,
            authorEmail: users.email,
          })
          .from(tenantSupportNotes)
          .innerJoin(users, eq(users.id, tenantSupportNotes.authorId))
          .where(eq(tenantSupportNotes.tenantId, input.tenantId))
          .orderBy(desc(tenantSupportNotes.createdAt))
          .limit(20),
        db
          .select({
            id: platformAuditLogs.id,
            action: platformAuditLogs.action,
            outcome: platformAuditLogs.outcome,
            resourceType: platformAuditLogs.resourceType,
            resourceId: platformAuditLogs.resourceId,
            createdAt: platformAuditLogs.createdAt,
            actorName: users.name,
            actorEmail: users.email,
          })
          .from(platformAuditLogs)
          .leftJoin(users, eq(users.id, platformAuditLogs.actorId))
          .where(eq(platformAuditLogs.tenantId, input.tenantId))
          .orderBy(desc(platformAuditLogs.createdAt))
          .limit(20),
        db
          .select({
            id: subscriptions.id,
            plan: subscriptions.plan,
            status: subscriptions.status,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
          })
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, input.tenantId))
          .orderBy(desc(subscriptions.updatedAt))
          .limit(1),
        db
          .select({
            status: invoices.status,
            amountCents: invoices.amountCents,
            currency: invoices.currency,
            dueAt: invoices.dueAt,
            paidAt: invoices.paidAt,
            createdAt: invoices.createdAt,
          })
          .from(invoices)
          .where(eq(invoices.tenantId, input.tenantId))
          .orderBy(desc(invoices.createdAt))
          .limit(1),
        db
          .select({
            dayDate: tenantMetricsDaily.dayDate,
            postsGenerated: tenantMetricsDaily.postsGenerated,
            leadsCaptured: tenantMetricsDaily.leadsCaptured,
          })
          .from(tenantMetricsDaily)
          .where(eq(tenantMetricsDaily.tenantId, input.tenantId))
          .orderBy(desc(tenantMetricsDaily.dayDate))
          .limit(1),
        getTenantCounts(input.tenantId),
        getTenantMtdAiSpend(input.tenantId),
      ]);

      return {
        tenant,
        members,
        recentAiUsage,
        recentSyncs,
        domains,
        notes,
        auditTrail,
        subscription: subscription ?? null,
        latestInvoice: latestInvoice ?? null,
        latestMetrics: metricsLatest ?? null,
        counts,
        mtdAiSpendUsd,
      };
    }),

  suspendTenant: sectionProcedure("tenants")
    .input(z.object({ tenantId: z.string().uuid(), reason: z.string().trim().min(3).max(280) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(tenants)
        .set({ suspended: true, updatedAt: new Date(), status: "suspended" })
        .where(eq(tenants.id, input.tenantId));

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        tenantId: input.tenantId,
        action: "tenant.suspended",
        resourceType: "tenant",
        resourceId: input.tenantId,
        metadata: { reason: input.reason },
      });

      return { ok: true };
    }),

  unsuspendTenant: sectionProcedure("tenants")
    .input(z.object({ tenantId: z.string().uuid(), reason: z.string().trim().min(3).max(280) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(tenants)
        .set({ suspended: false, updatedAt: new Date(), status: "active" })
        .where(eq(tenants.id, input.tenantId));

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        tenantId: input.tenantId,
        action: "tenant.unsuspended",
        resourceType: "tenant",
        resourceId: input.tenantId,
        metadata: { reason: input.reason },
      });

      return { ok: true };
    }),

  markTenantForReview: sectionProcedure("tenants")
    .input(z.object({ tenantId: z.string().uuid(), note: z.string().trim().min(3).max(280) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(tenants)
        .set({ status: "under_review", updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId));

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        tenantId: input.tenantId,
        action: "tenant.marked_for_review",
        resourceType: "tenant",
        resourceId: input.tenantId,
        metadata: { note: input.note },
      });

      return { ok: true };
    }),

  addTenantNote: sectionProcedure("tenants")
    .input(
      z.object({
        tenantId: z.string().uuid(),
        kind: z.string().trim().min(2).max(40).default("general"),
        body: z.string().trim().min(3).max(1200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [note] = await db
        .insert(tenantSupportNotes)
        .values({
          tenantId: input.tenantId,
          authorId: ctx.session.user.id,
          kind: input.kind,
          body: input.body,
        })
        .returning();

      if (!note) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create note" });
      }

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        tenantId: input.tenantId,
        action: "tenant.note_added",
        resourceType: "tenant_support_note",
        resourceId: note.id,
        metadata: { kind: input.kind },
      });

      return note;
    }),

  listPlatformUsers: sectionProcedure("users").query(async () => {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        platformRole: users.platformRole,
      })
      .from(users)
      .where(isNotNull(users.platformRole))
      .orderBy(users.email);

    const recentSessions = await db
      .select({
        userId: sessions.userId,
        lastSeenAt: max(sessions.updatedAt).as("last_seen_at"),
      })
      .from(sessions)
      .groupBy(sessions.userId);

    const sessionMap = new Map(recentSessions.map((row) => [row.userId, row.lastSeenAt]));

    return rows.map((row) => ({
      ...row,
      lastSeenAt: sessionMap.get(row.id) ?? null,
    }));
  }),

  setPlatformRole: sectionProcedure("users")
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["super_admin", "support_admin", "operations_admin", "finance_admin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.platformRole !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only super admins can assign roles" });
      }

      await db
        .update(users)
        .set({ platformRole: input.role, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        action: "platform_user.role_assigned",
        resourceType: "user",
        resourceId: input.userId,
        metadata: { role: input.role },
      });

      return { ok: true };
    }),

  clearPlatformRole: sectionProcedure("users")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.platformRole !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only super admins can remove roles" });
      }

      await ensureAnotherSuperAdminIfRemoving(input.userId, null);

      await db
        .update(users)
        .set({ platformRole: null, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        action: "platform_user.role_removed",
        resourceType: "user",
        resourceId: input.userId,
      });

      return { ok: true };
    }),

  billingOverview: sectionProcedure("billing").query(async () => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [mtdCost, subscriptionsRows, recentInvoices] = await Promise.all([
      db
        .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, monthStart)),
      db
        .select({
          tenantId: subscriptions.tenantId,
          tenantName: tenants.name,
          plan: subscriptions.plan,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(40),
      db
        .select({
          id: invoices.id,
          tenantId: invoices.tenantId,
          tenantName: tenants.name,
          amountCents: invoices.amountCents,
          currency: invoices.currency,
          status: invoices.status,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
        .orderBy(desc(invoices.createdAt))
        .limit(40),
    ]);

    return {
      mtdAiCostUsd: Number.parseFloat(mtdCost[0]?.total ?? "0"),
      subscriptions: subscriptionsRows,
      invoices: recentInvoices,
    };
  }),

  aiJobsOverview: sectionProcedure("aiJobs").query(async () => {
    const [recentCalls, pendingSocial, failedSocial, pendingLandingDrafts, recentPromptMix] =
      await Promise.all([
        db
          .select({
            id: aiUsage.id,
            tenantId: aiUsage.tenantId,
            tenantName: tenants.name,
            jobId: aiUsage.jobId,
            provider: aiUsage.provider,
            model: aiUsage.model,
            promptId: aiUsage.promptId,
            costUsd: aiUsage.costUsd,
            createdAt: aiUsage.createdAt,
          })
          .from(aiUsage)
          .innerJoin(tenants, eq(tenants.id, aiUsage.tenantId))
          .orderBy(desc(aiUsage.createdAt))
          .limit(50),
        db
          .select({
            id: socialPosts.id,
            tenantId: socialPosts.tenantId,
            tenantName: tenants.name,
            status: socialPosts.status,
            creativeStatus: socialPosts.creativeStatus,
            createdAt: socialPosts.createdAt,
            updatedAt: socialPosts.updatedAt,
          })
          .from(socialPosts)
          .innerJoin(tenants, eq(tenants.id, socialPosts.tenantId))
          .where(eq(socialPosts.status, "pending"))
          .orderBy(desc(socialPosts.createdAt))
          .limit(20),
        db
          .select({
            id: socialPosts.id,
            tenantId: socialPosts.tenantId,
            tenantName: tenants.name,
            status: socialPosts.status,
            creativeStatus: socialPosts.creativeStatus,
            creativeError: socialPosts.creativeError,
            createdAt: socialPosts.createdAt,
            updatedAt: socialPosts.updatedAt,
          })
          .from(socialPosts)
          .innerJoin(tenants, eq(tenants.id, socialPosts.tenantId))
          .where(eq(socialPosts.status, "failed"))
          .orderBy(desc(socialPosts.updatedAt))
          .limit(20),
        db
          .select({
            id: landingPages.id,
            tenantId: landingPages.tenantId,
            tenantName: tenants.name,
            title: landingPages.title,
            status: landingPages.status,
            createdAt: landingPages.createdAt,
            updatedAt: landingPages.updatedAt,
          })
          .from(landingPages)
          .innerJoin(tenants, eq(tenants.id, landingPages.tenantId))
          .where(and(eq(landingPages.status, "draft"), isNull(landingPages.currentVersionId)))
          .orderBy(desc(landingPages.updatedAt))
          .limit(20),
        db
          .select({
            promptId: aiUsage.promptId,
            count: sql<number>`count(*)::int`,
          })
          .from(aiUsage)
          .groupBy(aiUsage.promptId)
          .orderBy(sql`count(*) desc`)
          .limit(10),
      ]);

    return {
      recentCalls,
      pendingSocial,
      failedSocial,
      pendingLandingDrafts,
      recentPromptMix,
    };
  }),

  integrationsOverview: sectionProcedure("integrations").query(async () => {
    const [connections, syncRuns] = await Promise.all([
      db
        .select({
          id: integrationConnections.id,
          tenantId: integrationConnections.tenantId,
          tenantName: tenants.name,
          provider: integrationConnections.provider,
          status: integrationConnections.status,
          externalAccountId: integrationConnections.externalAccountId,
          lastSyncAt: integrationConnections.lastSyncAt,
          connectedAt: integrationConnections.connectedAt,
        })
        .from(integrationConnections)
        .innerJoin(tenants, eq(tenants.id, integrationConnections.tenantId))
        .orderBy(desc(integrationConnections.connectedAt))
        .limit(80),
      db
        .select({
          id: integrationSyncRuns.id,
          tenantId: integrationSyncRuns.tenantId,
          tenantName: tenants.name,
          provider: integrationSyncRuns.provider,
          status: integrationSyncRuns.status,
          recordsProcessed: integrationSyncRuns.recordsProcessed,
          errorMessage: integrationSyncRuns.errorMessage,
          createdAt: integrationSyncRuns.createdAt,
        })
        .from(integrationSyncRuns)
        .innerJoin(tenants, eq(tenants.id, integrationSyncRuns.tenantId))
        .orderBy(desc(integrationSyncRuns.createdAt))
        .limit(80),
    ]);

    return { connections, syncRuns };
  }),

  domainsOverview: sectionProcedure("domains").query(async () => {
    const rows = await db
      .select({
        id: customDomains.id,
        tenantId: customDomains.tenantId,
        tenantName: tenants.name,
        hostname: customDomains.hostname,
        status: customDomains.status,
        isPrimary: customDomains.isPrimary,
        certExpiresAt: customDomains.certExpiresAt,
        createdAt: customDomains.createdAt,
      })
      .from(customDomains)
      .innerJoin(tenants, eq(tenants.id, customDomains.tenantId))
      .orderBy(desc(customDomains.createdAt))
      .limit(80);
    return rows;
  }),

  listSupportSessions: sectionProcedure("support").query(async () => {
    const rows = await db
      .select({
        id: supportSessions.id,
        tenantId: supportSessions.tenantId,
        tenantName: tenants.name,
        actorId: supportSessions.actorId,
        actorName: users.name,
        actorEmail: users.email,
        reason: supportSessions.reason,
        status: supportSessions.status,
        startedAt: supportSessions.startedAt,
        expiresAt: supportSessions.expiresAt,
        endedAt: supportSessions.endedAt,
      })
      .from(supportSessions)
      .innerJoin(tenants, eq(tenants.id, supportSessions.tenantId))
      .innerJoin(users, eq(users.id, supportSessions.actorId))
      .orderBy(desc(supportSessions.startedAt))
      .limit(100);
    return rows;
  }),

  startSupportSession: sectionProcedure("support")
    .input(
      z.object({
        tenantId: z.string().uuid(),
        reason: z.string().trim().min(3).max(280),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [sessionRow] = await db
        .insert(supportSessions)
        .values({
          actorId: ctx.session.user.id,
          tenantId: input.tenantId,
          reason: input.reason,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        })
        .returning();

      if (!sessionRow) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create support session",
        });
      }

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        tenantId: input.tenantId,
        action: "support_session.started",
        resourceType: "support_session",
        resourceId: sessionRow.id,
        metadata: { reason: input.reason },
      });

      return sessionRow;
    }),

  endSupportSession: sectionProcedure("support")
    .input(
      z.object({
        sessionId: z.string().uuid(),
        reason: z.string().trim().min(3).max(280).default("Support session closed"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.id, input.sessionId));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Support session not found" });
      }

      await db
        .update(supportSessions)
        .set({
          status: "ended",
          endedAt: new Date(),
          endedReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(supportSessions.id, input.sessionId));

      await writePlatformAuditLog({
        actorId: ctx.session.user.id,
        actorPlatformRole: ctx.platformRole,
        tenantId: existing.tenantId,
        action: "support_session.ended",
        resourceType: "support_session",
        resourceId: input.sessionId,
        metadata: { reason: input.reason },
      });

      return { ok: true };
    }),

  getSupportSessionDetail: sectionProcedure("support")
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [sessionRow] = await db
        .select({
          id: supportSessions.id,
          tenantId: supportSessions.tenantId,
          tenantName: tenants.name,
          actorId: supportSessions.actorId,
          actorName: users.name,
          actorEmail: users.email,
          reason: supportSessions.reason,
          status: supportSessions.status,
          startedAt: supportSessions.startedAt,
          expiresAt: supportSessions.expiresAt,
          endedAt: supportSessions.endedAt,
          endedReason: supportSessions.endedReason,
        })
        .from(supportSessions)
        .innerJoin(tenants, eq(tenants.id, supportSessions.tenantId))
        .innerJoin(users, eq(users.id, supportSessions.actorId))
        .where(eq(supportSessions.id, input.sessionId));

      if (!sessionRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Support session not found" });
      }

      const tenantDetail = await Promise.all([
        db
          .select({
            id: landingPages.id,
            title: landingPages.title,
            slug: landingPages.slug,
            status: landingPages.status,
            updatedAt: landingPages.updatedAt,
          })
          .from(landingPages)
          .where(eq(landingPages.tenantId, sessionRow.tenantId))
          .orderBy(desc(landingPages.updatedAt))
          .limit(8),
        db
          .select({
            id: forms.id,
            name: forms.name,
            slug: forms.slug,
            isActive: forms.isActive,
            updatedAt: forms.updatedAt,
          })
          .from(forms)
          .where(eq(forms.tenantId, sessionRow.tenantId))
          .orderBy(desc(forms.updatedAt))
          .limit(8),
        db
          .select({
            id: contacts.id,
            email: contacts.email,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            lifecycleStage: contacts.lifecycleStage,
            leadScore: contacts.leadScore,
            updatedAt: contacts.updatedAt,
          })
          .from(contacts)
          .where(eq(contacts.tenantId, sessionRow.tenantId))
          .orderBy(desc(contacts.updatedAt))
          .limit(8),
        db
          .select({
            id: integrationConnections.id,
            provider: integrationConnections.provider,
            status: integrationConnections.status,
            lastSyncAt: integrationConnections.lastSyncAt,
          })
          .from(integrationConnections)
          .where(eq(integrationConnections.tenantId, sessionRow.tenantId))
          .orderBy(desc(integrationConnections.updatedAt))
          .limit(8),
        db
          .select({
            id: customDomains.id,
            hostname: customDomains.hostname,
            status: customDomains.status,
            isPrimary: customDomains.isPrimary,
          })
          .from(customDomains)
          .where(eq(customDomains.tenantId, sessionRow.tenantId))
          .orderBy(desc(customDomains.updatedAt))
          .limit(8),
      ]);

      return {
        session: sessionRow,
        landingPages: tenantDetail[0],
        forms: tenantDetail[1],
        contacts: tenantDetail[2],
        integrations: tenantDetail[3],
        domains: tenantDetail[4],
      };
    }),

  listAuditLogs: sectionProcedure("audit")
    .input(
      z.object({
        tenantId: z.string().uuid().optional(),
        outcome: z.enum(["all", "success", "failure"]).default("all"),
        query: z.string().trim().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const filters = [];
      if (input.tenantId) filters.push(eq(platformAuditLogs.tenantId, input.tenantId));
      if (input.outcome !== "all") filters.push(eq(platformAuditLogs.outcome, input.outcome));
      if (input.query) {
        filters.push(
          or(
            ilike(platformAuditLogs.action, `%${input.query}%`),
            ilike(platformAuditLogs.resourceType, `%${input.query}%`),
            ilike(users.email, `%${input.query}%`),
          ),
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, [countRow]] = await Promise.all([
        db
          .select({
            id: platformAuditLogs.id,
            actorId: platformAuditLogs.actorId,
            actorName: users.name,
            actorEmail: users.email,
            actorPlatformRole: platformAuditLogs.actorPlatformRole,
            tenantId: platformAuditLogs.tenantId,
            tenantName: tenants.name,
            action: platformAuditLogs.action,
            resourceType: platformAuditLogs.resourceType,
            resourceId: platformAuditLogs.resourceId,
            outcome: platformAuditLogs.outcome,
            metadata: platformAuditLogs.metadata,
            createdAt: platformAuditLogs.createdAt,
          })
          .from(platformAuditLogs)
          .leftJoin(users, eq(users.id, platformAuditLogs.actorId))
          .leftJoin(tenants, eq(tenants.id, platformAuditLogs.tenantId))
          .where(whereClause)
          .orderBy(desc(platformAuditLogs.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(platformAuditLogs)
          .leftJoin(users, eq(users.id, platformAuditLogs.actorId))
          .where(whereClause),
      ]);

      return {
        items: rows,
        total: countRow?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  systemHealth: sectionProcedure("health").query(async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [failedSyncs, recentFailures, recentTenantMetrics] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(integrationSyncRuns)
        .where(
          and(
            eq(integrationSyncRuns.status, "error"),
            gte(integrationSyncRuns.createdAt, thirtyDaysAgo),
          ),
        ),
      db
        .select({
          id: socialPosts.id,
          tenantId: socialPosts.tenantId,
          tenantName: tenants.name,
          error: socialPosts.creativeError,
          updatedAt: socialPosts.updatedAt,
        })
        .from(socialPosts)
        .innerJoin(tenants, eq(tenants.id, socialPosts.tenantId))
        .where(eq(socialPosts.status, "failed"))
        .orderBy(desc(socialPosts.updatedAt))
        .limit(10),
      db
        .select({
          tenantId: tenantMetricsDaily.tenantId,
          tenantName: tenants.name,
          dayDate: tenantMetricsDaily.dayDate,
          postsGenerated: tenantMetricsDaily.postsGenerated,
          leadsCaptured: tenantMetricsDaily.leadsCaptured,
        })
        .from(tenantMetricsDaily)
        .innerJoin(tenants, eq(tenants.id, tenantMetricsDaily.tenantId))
        .orderBy(desc(tenantMetricsDaily.dayDate))
        .limit(10),
    ]);

    return {
      env: {
        database: Boolean(process.env["DATABASE_URL"]),
        redis: Boolean(process.env["REDIS_URL"]),
        auth: Boolean(process.env["BETTER_AUTH_SECRET"]),
        stripe: Boolean(process.env["STRIPE_SECRET_KEY"]),
        resend: Boolean(process.env["RESEND_API_KEY"]),
        scaleway:
          Boolean(process.env["SCALEWAY_ACCESS_KEY"]) &&
          Boolean(process.env["SCALEWAY_SECRET_KEY"]) &&
          Boolean(process.env["SCALEWAY_BUCKET_NAME"]),
      },
      failedSyncs30d: failedSyncs[0]?.count ?? 0,
      recentSocialFailures: recentFailures,
      recentTenantMetrics,
    };
  }),
});
