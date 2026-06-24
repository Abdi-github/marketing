// Server component — fetches sequences + enrollment counts in a single query during SSR.
// Mutations (pause/resume, delete) are handled by the SequencesList client component
// which calls router.refresh() to re-run this server component after each mutation.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@marketing/auth";
import { env } from "@marketing/shared";
import { buildTenantContext } from "@marketing/tenancy";
import {
  db,
  emailSendingDomains,
  emailSequenceEnrollments,
  emailSequences,
  emailSends,
  emailSuppressions,
  emailTemplates,
} from "@marketing/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { SequencesList } from "./_sequences-list";

type Props = { params: Promise<{ locale: string }> };

function isUsablePlatformSender(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const email = normalized.match(/<([^>]+)>/)?.[1] ?? normalized;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".localhost");
}

export default async function SequencesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("Sequences");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const { tenantId } = tenantCtx;
  const platformSenderReady = isUsablePlatformSender(env.EMAIL_FROM_ADDRESS);

  const [templateCount, sendCount, failedCount, suppressionCount, verifiedDomainCount] =
    await Promise.all([
      db
        .select({ total: count() })
        .from(emailTemplates)
        .where(eq(emailTemplates.tenantId, tenantId)),
      db.select({ total: count() }).from(emailSends).where(eq(emailSends.tenantId, tenantId)),
      db
        .select({ total: count() })
        .from(emailSends)
        .where(and(eq(emailSends.tenantId, tenantId), eq(emailSends.status, "failed"))),
      db
        .select({ total: count() })
        .from(emailSuppressions)
        .where(eq(emailSuppressions.tenantId, tenantId)),
      db
        .select({ total: count() })
        .from(emailSendingDomains)
        .where(
          and(
            eq(emailSendingDomains.tenantId, tenantId),
            eq(emailSendingDomains.status, "verified"),
          ),
        ),
    ]);

  // Single query: sequences + active enrollment count (no N+1)
  const rows = await db
    .select({
      id: emailSequences.id,
      name: emailSequences.name,
      triggerEvent: emailSequences.triggerEvent,
      status: emailSequences.status,
      steps: emailSequences.steps,
      createdAt: emailSequences.createdAt,
      activeEnrollments: count(emailSequenceEnrollments.id),
    })
    .from(emailSequences)
    .leftJoin(
      emailSequenceEnrollments,
      and(
        eq(emailSequenceEnrollments.sequenceId, emailSequences.id),
        sql`${emailSequenceEnrollments.status} IN ('enrolled', 'paused')`,
      ),
    )
    .where(eq(emailSequences.tenantId, tenantId))
    .groupBy(emailSequences.id)
    .orderBy(desc(emailSequences.createdAt));

  const sequences = rows.map((r) => ({
    id: r.id,
    name: r.name,
    triggerEvent: r.triggerEvent,
    status: r.status,
    stepsCount: Array.isArray(r.steps) ? (r.steps as unknown[]).length : 0,
    activeEnrollments: Number(r.activeEnrollments),
    createdAt: r.createdAt.toISOString(),
  }));
  const verifiedTenantDomains = verifiedDomainCount[0]?.total ?? 0;
  const senderReady = verifiedTenantDomains > 0 || platformSenderReady;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t("title")}</h1>
        <Link
          href={`/${locale}/sequences/new`}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {t("newSequence")}
        </Link>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        {[
          ["Templates", templateCount[0]?.total ?? 0],
          ["Sequences", sequences.length],
          ["Emails sent", sendCount[0]?.total ?? 0],
          ["Failed sends", failedCount[0]?.total ?? 0],
          ["Suppressed", suppressionCount[0]?.total ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div
        className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          senderReady
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              {senderReady ? "Email sender ready" : "Email sender not ready"}
            </p>
            <p className="mt-1">
              {verifiedTenantDomains > 0
                ? "A verified business sending domain is available for production delivery."
                : platformSenderReady
                  ? "The platform sender is configured. Confirm the domain is verified in Resend before running real production tests."
                  : "Configure a real platform sender or verify a business sending domain before activating automations."}
            </p>
          </div>
          <Link href={`/${locale}/emails/settings`} className="font-medium underline">
            Open email settings
          </Link>
        </div>
      </div>

      <SequencesList initialSequences={sequences} locale={locale} senderReady={senderReady} />
    </div>
  );
}
