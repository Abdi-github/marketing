// Server component — finds duplicate contact groups during SSR.
// Merge action is handled by DuplicatesList client component which calls router.refresh() after each merge.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@marketing/auth";
import { buildTenantContext } from "@marketing/tenancy";
import { db, contacts } from "@marketing/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DuplicatesList } from "./_duplicates-list";

type Props = { params: Promise<{ locale: string }> };

export default async function DuplicatesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("Duplicates");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token).catch(() => null);
  if (!tenantCtx) redirect(`/${locale}/login`);

  const { tenantId } = tenantCtx;

  // 1) Phone duplicates
  const phoneRows = (await db.execute(sql`
    SELECT
      regexp_replace(phone, '[[:space:]]|[()\\-]', '', 'g') AS phone,
      array_agg(id ORDER BY first_seen_at) AS ids
    FROM contacts
    WHERE tenant_id = ${tenantId}
      AND phone IS NOT NULL
      AND length(regexp_replace(phone, '[[:space:]]|[()\\-]', '', 'g')) >= 6
    GROUP BY regexp_replace(phone, '[[:space:]]|[()\\-]', '', 'g')
    HAVING count(*) >= 2
    LIMIT 200
  `)) as unknown as Array<{ phone: string; ids: string[] }>;

  // 2) Name duplicates
  const nameRows = (await db.execute(sql`
    SELECT
      lower(first_name) || ' ' || lower(last_name) AS display,
      array_agg(id ORDER BY first_seen_at) AS ids
    FROM contacts
    WHERE tenant_id = ${tenantId}
      AND first_name IS NOT NULL
      AND last_name IS NOT NULL
      AND length(trim(first_name)) > 0
      AND length(trim(last_name)) > 0
    GROUP BY lower(first_name), lower(last_name)
    HAVING count(*) >= 2
    LIMIT 200
  `)) as unknown as Array<{ display: string; ids: string[] }>;

  // Merge into groups, deduplicating contacts already caught by phone
  const idsSet = new Set<string>();
  const allGroups: Array<{ ids: string[]; reason: "phone" | "name"; key: string }> = [];
  for (const row of phoneRows) {
    allGroups.push({ ids: row.ids, reason: "phone", key: row.phone });
    row.ids.forEach((id) => idsSet.add(id));
  }
  for (const row of nameRows) {
    const allCoveredByPhone = row.ids.every((id) => idsSet.has(id));
    if (!allCoveredByPhone) {
      allGroups.push({ ids: row.ids, reason: "name", key: row.display });
      row.ids.forEach((id) => idsSet.add(id));
    }
  }

  // Hydrate to full contact rows
  let groups: Array<{
    reason: "phone" | "name";
    key: string;
    contacts: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      leadScore: number;
      firstSeenAt: string;
    }>;
  }> = [];

  if (idsSet.size > 0) {
    const contactRows = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        phone: contacts.phone,
        leadScore: contacts.leadScore,
        firstSeenAt: contacts.firstSeenAt,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, [...idsSet])));
    const byId = new Map(contactRows.map((c) => [c.id, c]));

    groups = allGroups.map((g) => ({
      reason: g.reason,
      key: g.key,
      contacts: g.ids
        .map((id) => byId.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => ({ ...c, firstSeenAt: c.firstSeenAt.toISOString() })),
    }));
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <Link href={`/${locale}/crm`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {t("backToContacts")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <div className="mb-4 text-5xl">✓</div>
          <p className="font-medium text-gray-700">{t("noneFoundTitle")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("noneFoundBody")}</p>
        </div>
      ) : (
        <DuplicatesList initialGroups={groups} locale={locale} />
      )}
    </div>
  );
}
