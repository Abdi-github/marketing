"use client";

import { useEffect, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { PlatformStatCard } from "@/components/platform/stat-card";
import { trpc } from "@/lib/trpc";

type HealthData = Awaited<ReturnType<typeof trpc.platform.systemHealth.query>>;

export default function PlatformHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.systemHealth
      .query()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load system health"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="System Health"
        subtitle="Configuration readiness and a few practical cross-platform risk signals."
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading system health…</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <PlatformStatCard label="Failed syncs (30d)" value={data.failedSyncs30d} />
              <PlatformStatCard
                label="Recent social failures"
                value={data.recentSocialFailures.length}
              />
              <PlatformStatCard
                label="Recent metric rows"
                value={data.recentTenantMetrics.length}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Environment readiness</h2>
                <div className="mt-4 space-y-3">
                  {Object.entries(data.env).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{key}</span>
                      <span className={value ? "text-green-700" : "text-red-700"}>
                        {value ? "configured" : "missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Recent failures</h2>
                <div className="mt-4 space-y-3">
                  {data.recentSocialFailures.map((row) => (
                    <div key={row.id} className="rounded-lg border border-red-100 bg-red-50 p-3">
                      <p className="text-sm font-medium text-red-900">{row.tenantName}</p>
                      <p className="mt-1 text-xs text-red-700">{row.error ?? "Unknown failure"}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
