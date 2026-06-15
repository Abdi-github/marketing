import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomePageContent locale={locale} />;
}

function PricingCard({
  name,
  price,
  duration,
  cta,
  ctaHref,
  features,
  highlighted,
  badge,
}: {
  name: string;
  price: string;
  duration: string;
  cta: string;
  ctaHref: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-8 ${
        highlighted
          ? "border-black bg-black text-white shadow-xl"
          : "border-gray-200 bg-white text-gray-900 shadow-sm"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
          {badge}
        </span>
      )}
      <div className="mb-4">
        <span
          className={`text-sm font-semibold uppercase tracking-wider ${highlighted ? "text-gray-300" : "text-gray-500"}`}
        >
          {name}
        </span>
      </div>
      <div className="mb-6 flex items-baseline gap-1">
        <span className="text-4xl font-bold">{price}</span>
        <span className={`text-sm ${highlighted ? "text-gray-400" : "text-gray-500"}`}>
          {duration}
        </span>
      </div>
      <ul className="mb-8 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <span className={highlighted ? "text-green-400" : "text-green-600"}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold transition ${
          highlighted
            ? "bg-white text-black hover:bg-gray-100"
            : "bg-black text-white hover:bg-gray-900"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function HomePageContent({ locale }: { locale: string }) {
  const t = useTranslations("HomePage");
  const nav = useTranslations("Navigation");

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── Nav ── */}
      <nav className="fixed inset-x-0 top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href={`/${locale}`} className="text-lg font-bold tracking-tight">
            MarketingAI CH
          </Link>
          <div className="hidden gap-6 text-sm font-medium text-gray-600 md:flex">
            <a href="#features" className="hover:text-gray-900">
              {nav("features")}
            </a>
            <a href="#pricing" className="hover:text-gray-900">
              {nav("pricing")}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/login`}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              {nav("login")}
            </Link>
            <Link
              href={`/${locale}/signup`}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
            >
              {nav("signup")}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="mb-6 inline-block rounded-full bg-green-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-green-700">
            {t("heroBadge")}
          </span>
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-6xl">
            {t("title")}
          </h1>
          <p className="mb-10 text-xl text-gray-500 md:text-2xl">{t("subtitle")}</p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={`/${locale}/signup`}
              className="rounded-xl bg-black px-8 py-4 text-base font-bold text-white shadow-lg hover:bg-gray-900"
            >
              {t("heroCtaPrimary")}
            </Link>
            <a
              href="#features"
              className="rounded-xl border border-gray-300 px-8 py-4 text-base font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("heroCtaSecondary")}
            </a>
          </div>
          <p className="mt-6 text-xs text-gray-400">{t("footerDataResidency")}</p>
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="border-y border-gray-100 bg-white px-6 py-10">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {t("socialProofEyebrow")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-semibold text-gray-500">
            <span className="opacity-70">Café Bern</span>
            <span className="opacity-70">Trattoria Lugano</span>
            <span className="opacity-70">Yoga Studio Zürich</span>
            <span className="opacity-70">Restaurant Léman</span>
            <span className="opacity-70">FitClub Basel</span>
          </div>
          <p className="mt-4 text-xs text-gray-400">{t("socialProofFootnote")}</p>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-16 text-center text-3xl font-bold tracking-tight">
            {t("featuresTitle")}
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {(
              [
                { title: t("feature1Title"), desc: t("feature1Desc"), icon: "✍️" },
                { title: t("feature2Title"), desc: t("feature2Desc"), icon: "🚀" },
                { title: t("feature3Title"), desc: t("feature3Desc"), icon: "🔗" },
              ] as const
            ).map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-3 text-lg font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight">
            {t("pricingTitle")}
          </h2>
          <p className="mb-16 text-center text-gray-500">{t("pricingSubtitle")}</p>
          <div className="grid gap-8 md:grid-cols-3">
            <PricingCard
              name={t("planTrialName")}
              price={t("planTrialPrice")}
              duration={t("planTrialDuration")}
              cta={t("planTrialCta")}
              ctaHref={`/${locale}/signup`}
              features={[t("planTrialFeature1"), t("planTrialFeature2"), t("planTrialFeature3")]}
            />
            <PricingCard
              name={t("planStarterName")}
              price={t("planStarterPrice")}
              duration={t("planStarterDuration")}
              cta={t("planStarterCta")}
              ctaHref={`/${locale}/signup`}
              features={[
                t("planStarterFeature1"),
                t("planStarterFeature2"),
                t("planStarterFeature3"),
              ]}
            />
            <PricingCard
              name={t("planGrowthName")}
              price={t("planGrowthPrice")}
              duration={t("planGrowthDuration")}
              cta={t("planGrowthCta")}
              ctaHref={`/${locale}/signup`}
              features={[t("planGrowthFeature1"), t("planGrowthFeature2"), t("planGrowthFeature3")]}
              highlighted
              badge={t("planMostPopular")}
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-t border-gray-100 bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">{t("faqTitle")}</h2>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <details
                key={i}
                className="group rounded-xl border border-gray-200 bg-white px-5 py-4 open:shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-gray-900 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>{t(`faq${i}Q` as `faq1Q`)}</span>
                  <span className="ml-4 text-gray-400 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {t(`faq${i}A` as `faq1A`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-gray-50 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <div className="flex gap-4 text-xs text-gray-400">
            <Link href={`/${locale}/legal/privacy`} className="hover:text-gray-600">
              {t("footerPrivacy")}
            </Link>
            <Link href={`/${locale}/legal/terms`} className="hover:text-gray-600">
              {t("footerTerms")}
            </Link>
            <Link href={`/${locale}/legal/imprint`} className="hover:text-gray-600">
              {t("footerImprint")}
            </Link>
          </div>
          <p className="text-xs text-gray-400">{t("footerDataResidency")}</p>
          <div className="flex gap-3 text-xs text-gray-300">
            <Link href="/de" className="hover:text-gray-500">
              DE
            </Link>
            <span>·</span>
            <Link href="/fr" className="hover:text-gray-500">
              FR
            </Link>
            <span>·</span>
            <Link href="/it" className="hover:text-gray-500">
              IT
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
