import { db } from "@marketing/db";
import { aiUsage, stripeCustomers, subscriptions, invoices, tenants } from "@marketing/db";
import {
  getPlanCaps,
  monthlyBudgetKey,
  createStripeCustomer,
  createCheckoutSession,
} from "@marketing/billing";
import { env, logger } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import IORedis from "ioredis";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";

// Lazy Redis client — reads REDIS_URL from env. Reused across requests.
let _redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!_redis) _redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  return _redis;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getMonthlySpend(tenantId: string): Promise<number> {
  try {
    const key = monthlyBudgetKey(tenantId);
    const cached = await getRedis().get(key);
    if (cached !== null) return parseFloat(cached);
  } catch {
    // Redis unavailable — fall through to DB.
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(cost_usd), 0)` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.tenantId, tenantId),
        gte(aiUsage.createdAt, monthStart),
      ),
    );
  return parseFloat(row?.total ?? "0");
}

async function ensureStripeCustomer(
  tenantId: string,
  email: string,
  name: string,
): Promise<string> {
  const [existing] = await db
    .select({ stripeCustomerId: stripeCustomers.stripeCustomerId })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.tenantId, tenantId));

  if (existing) return existing.stripeCustomerId;

  const stripeCustomerId = await createStripeCustomer({ email, name, tenantId });
  await db
    .insert(stripeCustomers)
    .values({ tenantId, stripeCustomerId })
    .onConflictDoNothing({ target: stripeCustomers.tenantId });

  return stripeCustomerId;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const billingRouter = router({
  // Returns the tenant's current plan, MTD spend, remaining budget, and next reset date.
  getUsageSummary: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;

    const [tenant] = await db
      .select({ plan: tenants.plan, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId));

    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

    const planCaps = getPlanCaps(tenant.plan);
    const mtdSpendUsd = await getMonthlySpend(tenantId);

    const now = new Date();
    const nextResetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    // Active subscription (if any).
    const [sub] = await db
      .select({
        plan: subscriptions.plan,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, tenantId),
          eq(subscriptions.status, "active"),
        ),
      );

    // Last 3 invoices.
    const recentInvoices = await db
      .select({
        stripeInvoiceId: invoices.stripeInvoiceId,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
        pdfUrl: invoices.pdfUrl,
        paidAt: invoices.paidAt,
      })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(sql`created_at DESC`)
      .limit(3);

    return {
      plan: tenant.plan,
      planDisplayName: planCaps.displayName,
      monthlyAiBudgetUsd: planCaps.monthlyAiBudgetUsd,
      mtdSpendUsd: Number(mtdSpendUsd.toFixed(4)),
      remainingBudgetUsd: Math.max(0, planCaps.monthlyAiBudgetUsd - mtdSpendUsd),
      nextResetDate: nextResetDate.toISOString(),
      subscription: sub ?? null,
      recentInvoices,
    };
  }),

  // Creates a Stripe Checkout session and returns the URL to redirect to.
  createCheckoutSession: tenantProcedure
    .input(
      z.object({
        plan: z.enum(["starter", "growth"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const session = ctx.session;

      if (!env.STRIPE_SECRET_KEY) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Billing is not configured. Contact support.",
        });
      }

      const priceId =
        input.plan === "starter"
          ? env.STRIPE_STARTER_PRICE_ID
          : env.STRIPE_GROWTH_PRICE_ID;

      if (!priceId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `${input.plan} price ID is not configured.`,
        });
      }

      const email = session.user.email ?? "";
      const name = session.user.name ?? "Unknown";

      let stripeCustomerId: string;
      try {
        stripeCustomerId = await ensureStripeCustomer(tenantId, email, name);
      } catch (err) {
        logger.error({ err: String(err), tenantId }, "[billing] failed to create Stripe customer");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create billing customer." });
      }

      const baseUrl = env.APP_URL;
      const checkoutUrl = await createCheckoutSession({
        stripeCustomerId,
        priceId,
        successUrl: `${baseUrl}/dashboard/billing?upgraded=true`,
        cancelUrl: `${baseUrl}/dashboard/billing?canceled=true`,
        tenantId,
      });

      return { checkoutUrl };
    }),
});
