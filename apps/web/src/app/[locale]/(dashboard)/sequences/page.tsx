// Server component — fetches sequences + enrollment counts in a single query during SSR.
// Mutations (pause/resume, delete) are handled by the SequencesList client component
// which calls router.refresh() to re-run this server component after each mutation.

import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@marketing/shared";
import { buildTenantContext } from "@marketing/tenancy";
import { getSafeServerSession } from "@/server/auth/safe-session";
import {
  db,
  contacts,
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

  const session = await getSafeServerSession("sequences-page");
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
      db
        .select({ total: count() })
        .from(emailSends)
        .where(
          and(
            eq(emailSends.tenantId, tenantId),
            sql`${emailSends.status} IN ('sent', 'delivered', 'opened', 'clicked')`,
          ),
        ),
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

  const recentSends = await db
    .select({
      id: emailSends.id,
      status: emailSends.status,
      providerStatus: emailSends.providerStatus,
      failureReason: emailSends.failureReason,
      sentAt: emailSends.sentAt,
      deliveredAt: emailSends.deliveredAt,
      createdAt: emailSends.createdAt,
      templateName: emailTemplates.name,
      contactEmail: contacts.email,
    })
    .from(emailSends)
    .innerJoin(
      emailTemplates,
      and(eq(emailTemplates.id, emailSends.templateId), eq(emailTemplates.tenantId, tenantId)),
    )
    .innerJoin(
      contacts,
      and(eq(contacts.id, emailSends.contactId), eq(contacts.tenantId, tenantId)),
    )
    .where(eq(emailSends.tenantId, tenantId))
    .orderBy(desc(emailSends.createdAt))
    .limit(8);

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

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Recent email activity</h2>
            <p className="text-sm text-gray-500">
              Latest sequence sends, skips, and delivery issues for troubleshooting.
            </p>
          </div>
          <Link href={`/${locale}/emails/settings`} className="text-sm font-medium text-blue-600">
            Sender setup
          </Link>
        </div>
        {recentSends.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">
            No email sends yet. Send a test or enroll a contact after creating a sequence.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentSends.map((send) => {
              const tone =
                send.status === "failed" ||
                send.status === "bounced" ||
                send.status === "complained"
                  ? "text-red-700 bg-red-50 border-red-200"
                  : send.status === "skipped"
                    ? "text-amber-800 bg-amber-50 border-amber-200"
                    : "text-emerald-700 bg-emerald-50 border-emerald-200";
              return (
                <div
                  key={send.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{send.templateName}</p>
                    <p className="text-xs text-gray-500">
                      {send.contactEmail} ·{" "}
                      {(send.deliveredAt ?? send.sentAt ?? send.createdAt).toLocaleString(locale)}
                    </p>
                    {send.failureReason && (
                      <p className="mt-1 text-xs text-red-700">{send.failureReason}</p>
                    )}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>
                    {send.providerStatus ?? send.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SequencesList initialSequences={sequences} locale={locale} senderReady={senderReady} />
    </div>
  );
}
