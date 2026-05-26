import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomePageContent />;
}

function HomePageContent() {
  const t = useTranslations("HomePage");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900">{t("title")}</h1>
      <p className="mt-4 text-lg text-gray-600">{t("subtitle")}</p>
    </main>
  );
}
