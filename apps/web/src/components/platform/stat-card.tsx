import type { ReactNode } from "react";

export function PlatformStatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`mt-2 text-3xl font-semibold text-gray-900 ${accent ?? ""}`}>{value}</p>
        </div>
      </div>
      {hint ? <p className="mt-2 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
