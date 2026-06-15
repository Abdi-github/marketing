// Server component — fetches forms + lead counts during SSR.
// No loading skeleton, no client waterfall. Data is in HTML on first paint.
// Mutations (delete, toggle active) are handled by FormsList client component
// which calls router.refresh() to re-run this server component after mutations.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, forms, leads } from "@marketing/db";
import { count, desc, eq } from "drizzle-orm";
import { FormsList } from "./_forms-list";

type Props = { params: Promise<{ locale: string }> };

export default async function FormsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("Forms");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const { tenantId } = tenantCtx;

  // Single query: forms + lead count via LEFT JOIN (no N+1)
  const rows = await db
    .select({
      id: forms.id,
      name: forms.name,
      slug: forms.slug,
      isActive: forms.isActive,
      createdAt: forms.createdAt,
      leadCount: count(leads.id),
    })
    .from(forms)
    .leftJoin(leads, eq(leads.formId, forms.id))
    .where(eq(forms.tenantId, tenantId))
    .groupBy(forms.id)
    .orderBy(desc(forms.createdAt))
    .limit(50);

  const formItems = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isActive: r.isActive,
    leadCount: Number(r.leadCount),
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/forms/new`}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          + {t("newForm")}
        </Link>
      </div>

      <FormsList initialForms={formItems} total={formItems.length} locale={locale} />
    </div>
  );
}
