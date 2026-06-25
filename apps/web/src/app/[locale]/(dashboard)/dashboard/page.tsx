import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { logger } from "@marketing/shared";
import { buildTenantContext } from "@marketing/tenancy";
import { getBusinessProfile } from "@marketing/tenancy";
import { db, contacts, deals, landingPages, socialPosts, leads } from "@marketing/db";
import { and, count, eq, gte, sum } from "drizzle-orm";
import { getSafeServerSession } from "@/server/auth/safe-session";

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;

  const session = await getSafeServerSession("dashboard-page");
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch((error) => {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      "[dashboard] Failed to build tenant context",
    );
    return null;
  });

  if (!tenantCtx) redirect(`/${locale}/login`);

  const profile = await getBusinessProfile(tenantCtx).catch((error) => {
    logger.warn(
      {
        tenantId: tenantCtx.tenantId,
        err: error instanceof Error ? error.message : String(error),
      },
      "[dashboard] Failed to load business profile",
    );
    return null;
  });
  if (!profile) {
    redirect(`/${locale}/dashboard/setup`);
  }

  const t = await getTranslations("Overview");
  const { tenantId } = tenantCtx;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Parallel stat fetches. Each is wrapped so a single failure can't kill the page.
  const [
    contactsCount,
    leadsThisMonth,
    postsPublishedThisMonth,
    livePagesCount,
    openPipelineValue,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
    db
      .select({ n: count() })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), gte(leads.submittedAt, monthStart)))
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
    db
      .select({ n: count() })
      .from(socialPosts)
      .where(
        and(eq(socialPosts.tenantId, tenantId), gte(socialPosts.publishedToMetaAt, monthStart)),
      )
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
    db
      .select({ n: count() })
      .from(landingPages)
      .where(and(eq(landingPages.tenantId, tenantId), eq(landingPages.status, "published")))
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
    db
      .select({ total: sum(deals.amountChf) })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, "open")))
      .then((r) => Number(r[0]?.total ?? 0))
      .catch(() => 0),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("greeting", { name: profile.businessName ?? "" })}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      {/* KPI tiles */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile
          label={t("kpiContacts")}
          value={contactsCount.toLocaleString()}
          href={`/${locale}/crm`}
          tone="blue"
        />
        <KpiTile
          label={t("kpiLeadsMonth")}
          value={leadsThisMonth.toLocaleString()}
          href={`/${locale}/crm`}
          tone="emerald"
        />
        <KpiTile
          label={t("kpiPostsMonth")}
          value={postsPublishedThisMonth.toLocaleString()}
          href={`/${locale}/dashboard/posts`}
          tone="purple"
        />
        <KpiTile
          label={t("kpiLivePages")}
          value={livePagesCount.toLocaleString()}
          href={`/${locale}/landing-pages`}
          tone="amber"
        />
        <KpiTile
          label={t("kpiPipeline")}
          value={`CHF ${openPipelineValue.toLocaleString()}`}
          href={`/${locale}/crm/deals`}
          tone="indigo"
        />
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <QuickAction
          icon="✍️"
          title={t("quickPostTitle")}
          body={t("quickPostBody")}
          cta={t("quickPostCta")}
          href={`/${locale}/dashboard/posts/new`}
        />
        <QuickAction
          icon="🚀"
          title={t("quickLandingTitle")}
          body={t("quickLandingBody")}
          cta={t("quickLandingCta")}
          href={`/${locale}/landing-pages/new`}
        />
        <QuickAction
          icon="👥"
          title={t("quickContactTitle")}
          body={t("quickContactBody")}
          cta={t("quickContactCta")}
          href={`/${locale}/crm`}
        />
      </div>

      {/* Empty-state nudge if the user has no activity at all */}
      {contactsCount === 0 && postsPublishedThisMonth === 0 && livePagesCount === 0 && (
        <div className="rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-blue-50 p-6 text-sm text-gray-700">
          <p className="mb-1 font-semibold text-gray-900">{t("nudgeTitle")}</p>
          <p>{t("nudgeBody")}</p>
        </div>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  blue: "bg-blue-50 border-blue-100 text-blue-700",
  emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
  purple: "bg-purple-50 border-purple-100 text-purple-700",
  amber: "bg-amber-50 border-amber-100 text-amber-700",
  indigo: "bg-indigo-50 border-indigo-100 text-indigo-700",
};

function KpiTile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string;
  href: string;
  tone: keyof typeof TONES;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-4 transition-colors hover:shadow-sm ${TONES[tone]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </Link>
  );
}

function QuickAction({
  icon,
  title,
  body,
  cta,
  href,
}: {
  icon: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-2 text-2xl">{icon}</div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mb-4 mt-1 flex-1 text-sm text-gray-500">{body}</p>
      <Link
        href={href}
        className="self-start text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        {cta} →
      </Link>
    </div>
  );
}
