// Server component — fetches sequences + enrollment counts in a single query during SSR.
// Mutations (pause/resume, delete) are handled by the SequencesList client component
// which calls router.refresh() to re-run this server component after each mutation.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, emailSequences, emailSequenceEnrollments } from "@marketing/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { SequencesList } from "./_sequences-list";

type Props = { params: Promise<{ locale: string }> };

export default async function SequencesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("Sequences");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const { tenantId } = tenantCtx;

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

      <SequencesList initialSequences={sequences} locale={locale} />
    </div>
  );
}
