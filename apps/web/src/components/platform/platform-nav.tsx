"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLATFORM_NAV_ITEMS, canAccessPlatformSection } from "@/lib/platform-access";
import type { PlatformRole } from "@marketing/db";

export function PlatformNav({ locale, role }: { locale: string; role: PlatformRole }) {
  const pathname = usePathname();

  const items = PLATFORM_NAV_ITEMS.filter((item) => canAccessPlatformSection(role, item.section));

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        {items.map((item) => {
          const href = `/${locale}${item.href}`;
          const active = item.exactMatch
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={item.href}
              href={href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
