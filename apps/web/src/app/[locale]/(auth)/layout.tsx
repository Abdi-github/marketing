import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AuthLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "AuthPanel" });

  return (
    <div className="grid min-h-screen bg-gray-50 lg:grid-cols-2">
      {/* Left: the form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link
            href={`/${locale}`}
            className="mb-8 flex items-center justify-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 text-sm font-bold text-white">
              M
            </span>
            MarketingAI CH
          </Link>
          {children}
        </div>
      </div>

      {/* Right: marketing panel (hidden on small screens) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 p-12 text-white lg:flex">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-200">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight">{t("headline")}</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-purple-100">{t("subhead")}</p>
        </div>

        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20">
              ✓
            </span>
            <span>{t("bullet1")}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20">
              ✓
            </span>
            <span>{t("bullet2")}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20">
              ✓
            </span>
            <span>{t("bullet3")}</span>
          </li>
        </ul>

        <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
          <p className="text-sm italic text-white">«{t("quoteText")}»</p>
          <p className="mt-2 text-xs text-purple-200">— {t("quoteAuthor")}</p>
        </div>

        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-12 h-80 w-80 rounded-full bg-purple-300/20 blur-3xl" />
      </div>
    </div>
  );
}
