// Server component — fetches billing summary during SSR.
// URL banners (?upgraded, ?canceled) and Stripe checkout redirect handled by _billing-content client component.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, tenants, subscriptions, invoices, aiUsage } from "@marketing/db";
import { getPlanCaps } from "@marketing/billing";
import { and, eq, gte, sql } from "drizzle-orm";
import { BillingContent } from "./_billing-content";

type Props = { params: Promise<{ locale: string }> };

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const { tenantId } = tenantCtx;

  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) redirect(`/${locale}/login`);

  const planCaps = getPlanCaps(tenant.plan);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextResetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [spendRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.tenantId, tenantId), gte(aiUsage.createdAt, monthStart)));

  const mtdSpendUsd = parseFloat(spendRow?.total ?? "0");

  const [sub] = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "active")));

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
    .orderBy(sql`${invoices.createdAt} DESC`)
    .limit(3);

  const summary = {
    plan: tenant.plan,
    monthlyAiBudgetUsd: planCaps.monthlyAiBudgetUsd,
    mtdSpendUsd: Number(mtdSpendUsd.toFixed(4)),
    nextResetDate: nextResetDate.toISOString(),
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status as string,
          currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        }
      : null,
    recentInvoices: recentInvoices.map((inv) => ({
      stripeInvoiceId: inv.stripeInvoiceId,
      amountCents: inv.amountCents,
      currency: inv.currency,
      status: inv.status,
      pdfUrl: inv.pdfUrl ?? null,
      paidAt: inv.paidAt?.toISOString() ?? null,
    })),
  };

  return <BillingContent summary={summary} locale={locale} />;
}
