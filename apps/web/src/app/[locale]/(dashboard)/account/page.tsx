import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import {
  brandAssets,
  businessProfiles,
  customDomains,
  db,
  emailSendingDomains,
  subscriptions,
  tenants,
} from "@marketing/db";
import { and, eq } from "drizzle-orm";

type Props = { params: Promise<{ locale: string }> };

type StatusTone = "complete" | "warning" | "empty";

function statusClasses(tone: StatusTone): string {
  if (tone === "complete") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (tone === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">Account readiness</span>
        <span className="text-gray-500">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  status,
  tone,
  href,
  action,
}: {
  title: string;
  description: string;
  status: string;
  tone: StatusTone;
  href: string;
  action: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(tone)}`}
        >
          {status}
        </span>
      </div>
      <Link
        href={href}
        className="mt-5 inline-flex rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        {action}
      </Link>
    </section>
  );
}

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const { tenantId, role } = tenantCtx;

  const [[tenant], [profile], [brand], domains, sendingDomains, [subscription]] = await Promise.all(
    [
      db
        .select({ name: tenants.name, plan: tenants.plan })
        .from(tenants)
        .where(eq(tenants.id, tenantId)),
      db.select().from(businessProfiles).where(eq(businessProfiles.tenantId, tenantId)),
      db.select().from(brandAssets).where(eq(brandAssets.tenantId, tenantId)),
      db
        .select({
          hostname: customDomains.hostname,
          status: customDomains.status,
          isPrimary: customDomains.isPrimary,
        })
        .from(customDomains)
        .where(eq(customDomains.tenantId, tenantId)),
      db
        .select({
          domain: emailSendingDomains.domain,
          status: emailSendingDomains.status,
          isPrimary: emailSendingDomains.isPrimary,
        })
        .from(emailSendingDomains)
        .where(eq(emailSendingDomains.tenantId, tenantId)),
      db
        .select({ status: subscriptions.status, plan: subscriptions.plan })
        .from(subscriptions)
        .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "active"))),
    ],
  );

  const profileComplete = Boolean(profile?.businessName && profile.vertical && profile.addressCity);
  const brandComplete = Boolean(
    brand && (brand.logoUrl || brand.voiceTone || brand.colorPrimary !== "#111827"),
  );
  const livePrimaryDomain = domains.find((domain) => domain.status === "live" && domain.isPrimary);
  const liveDomain = domains.find((domain) => domain.status === "live");
  const verifiedSender = sendingDomains.find(
    (domain) => domain.status === "verified" && domain.isPrimary,
  );
  const billingReady = tenant?.plan !== "trial" || Boolean(subscription);

  const checks = [
    profileComplete,
    brandComplete,
    Boolean(livePrimaryDomain ?? liveDomain),
    billingReady,
    Boolean(verifiedSender),
  ];
  const completed = checks.filter(Boolean).length;

  const accountName = profile?.businessName ?? tenant?.name ?? "Your account";
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">Account</p>
          <h1 className="text-2xl font-bold text-gray-900">{accountName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Brand, domains, billing, and business settings for this workspace.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{roleLabel}</span> role
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <ProgressBar completed={completed} total={checks.length} />
        <div className="mt-4 grid gap-3 text-sm text-gray-600 md:grid-cols-5">
          <span>{profileComplete ? "Business profile set" : "Business profile missing"}</span>
          <span>{brandComplete ? "Brand kit ready" : "Brand kit incomplete"}</span>
          <span>
            {(livePrimaryDomain ?? liveDomain) ? "Website domain live" : "No live website domain"}
          </span>
          <span>{billingReady ? "Billing configured" : "Trial billing"}</span>
          <span>{verifiedSender ? "Email sender verified" : "Email sender not verified"}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Business settings"
          description={
            profile
              ? `${profile.vertical} in ${profile.addressCity || "your city"} · content language ${profile.locale}`
              : "Add the basic business profile used by AI generation and dashboard defaults."
          }
          status={profileComplete ? "Complete" : "Needs details"}
          tone={profileComplete ? "complete" : "warning"}
          href={`/${locale}/dashboard/setup`}
          action="Open settings"
        />
        <Card
          title="Brand"
          description={
            brandComplete
              ? "Your brand colors, fonts, logo, and voice are available to generation workflows."
              : "Add logo, voice tone, and brand colors so websites, posts, and emails feel consistent."
          }
          status={brandComplete ? "Ready" : "Incomplete"}
          tone={brandComplete ? "complete" : "warning"}
          href={`/${locale}/brand`}
          action="Edit brand"
        />
        <Card
          title="Website domains"
          description={
            livePrimaryDomain
              ? `Primary domain: ${livePrimaryDomain.hostname}`
              : liveDomain
                ? `Live domain: ${liveDomain.hostname}. Set a primary domain for canonical URLs.`
                : "Connect a custom domain so generated websites feel credible and production-ready."
          }
          status={livePrimaryDomain ? "Primary live" : liveDomain ? "Live" : "Not connected"}
          tone={livePrimaryDomain || liveDomain ? "complete" : "empty"}
          href={`/${locale}/domains`}
          action="Manage domains"
        />
        <Card
          title="Billing"
          description={
            subscription
              ? `Active ${subscription.plan} subscription.`
              : `Current plan: ${tenant?.plan ?? "trial"}. Review usage, invoices, and plan options.`
          }
          status={billingReady ? "Configured" : "Trial"}
          tone={billingReady ? "complete" : "warning"}
          href={`/${locale}/billing`}
          action="Open billing"
        />
        <Card
          title="Email sender"
          description={
            verifiedSender
              ? `Primary sender domain: ${verifiedSender.domain}`
              : "Verify an email sending domain before broad production campaigns."
          }
          status={verifiedSender ? "Verified" : "Not verified"}
          tone={verifiedSender ? "complete" : "warning"}
          href={`/${locale}/emails/settings`}
          action="Manage sender"
        />
      </div>
    </div>
  );
}
