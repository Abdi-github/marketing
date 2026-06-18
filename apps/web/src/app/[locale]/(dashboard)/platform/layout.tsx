import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getPlatformRoleFromRequest } from "@/server/platform/auth";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PlatformLayout({ children, params }: Props) {
  const { locale } = await params;
  const { role } = await getPlatformRoleFromRequest();

  if (!role) {
    redirect(`/${locale}/dashboard`);
  }

  return <div className="min-h-full bg-gray-50">{children}</div>;
}
