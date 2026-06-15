// Server component — fetches email templates during SSR.
// No loading skeleton, no client round-trip. Data is in the HTML on first paint.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, emailTemplates } from "@marketing/db";
import { eq, desc } from "drizzle-orm";

type Props = { params: Promise<{ locale: string }> };

export default async function EmailsListPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("Emails");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const templates = await db
    .select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      subject: emailTemplates.subject,
      locale: emailTemplates.locale,
      aiDraftedAt: emailTemplates.aiDraftedAt,
      createdAt: emailTemplates.createdAt,
    })
    .from(emailTemplates)
    .where(eq(emailTemplates.tenantId, tenantCtx.tenantId))
    .orderBy(desc(emailTemplates.createdAt));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/emails/settings`}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Email settings
          </Link>
          <Link
            href={`/${locale}/emails/new`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + {t("newTemplate")}
          </Link>
        </div>
      </div>

      {templates.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <div className="mb-4 text-5xl">✉️</div>
          <p className="text-gray-600">{t("empty")}</p>
          <Link
            href={`/${locale}/emails/new`}
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            {t("createFirst")} →
          </Link>
        </div>
      )}

      {templates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 text-left">{t("colName")}</th>
                <th className="px-4 py-3 text-left">{t("colSubject")}</th>
                <th className="hidden px-4 py-3 text-left md:table-cell">{t("colLocale")}</th>
                <th className="hidden px-4 py-3 text-left lg:table-cell">{t("colCreated")}</th>
                <th className="px-4 py-3 text-right">{t("colSource")}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr
                  key={tpl.id}
                  className="border-b transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/emails/${tpl.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {tpl.name}
                    </Link>
                  </td>
                  <td className="max-w-md truncate px-4 py-3 text-gray-600">{tpl.subject}</td>
                  <td className="hidden px-4 py-3 text-gray-500 md:table-cell">{tpl.locale}</td>
                  <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
                    {new Date(tpl.createdAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {tpl.aiDraftedAt ? (
                      <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                        ✨ {t("badgeAi")}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{t("badgeManual")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
