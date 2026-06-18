import type { ReactNode } from "react";

export function PlatformPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
