import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getPlatformSidebarGroups } from "@/lib/platform-access";
import { getPlatformRoleFromRequest } from "@/server/platform/auth";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminsLayout({ children, params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const { role } = await getPlatformRoleFromRequest();

  if (!role) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        locale={locale}
        logoutLabel={t("logout")}
        brandName="Admin Control"
        homeHref={`/${locale}/admins`}
        groups={getPlatformSidebarGroups(locale, role)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="h-14 flex-shrink-0 lg:hidden" />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
