"use client";

import { usePathname, useRouter } from "next/navigation";
import { routing } from "@/i18n/routing";

type Props = {
  currentLocale: string;
};

export function LocaleSwitcher({ currentLocale }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(locale: string) {
    const segments = pathname.split("/");
    segments[1] = locale;
    router.push(segments.join("/"));
  }

  return (
    <select
      value={currentLocale}
      onChange={(e) => switchTo(e.target.value)}
      className="cursor-pointer rounded border bg-white px-2 py-1 text-xs hover:border-gray-400"
      aria-label="Locale"
      suppressHydrationWarning
    >
      {routing.locales.map((loc) => (
        <option key={loc} value={loc} suppressHydrationWarning>
          {loc.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
