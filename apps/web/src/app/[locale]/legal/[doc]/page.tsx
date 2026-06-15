import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string; doc: string }> };

const VALID_DOCS = new Set(["privacy", "terms", "imprint"]);

export default async function LegalPage({ params }: Props) {
  const { locale, doc } = await params;
  if (!VALID_DOCS.has(doc)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("Legal");
  const title = t(`${doc}Title` as "privacyTitle");
  const body = t(`${doc}Body` as "privacyBody");

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href={`/${locale}`} className="text-sm text-gray-500 hover:text-gray-700">
        ← {t("backHome")}
      </Link>
      <h1 className="mt-6 text-3xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-xs text-gray-400">{t("lastUpdated", { date: "2026-06-07" })}</p>
      <div className="prose prose-sm mt-8 max-w-none whitespace-pre-line leading-relaxed text-gray-700">
        {body}
      </div>
      <p className="mt-10 text-xs text-gray-400">{t("contactNote")}</p>
    </div>
  );
}
