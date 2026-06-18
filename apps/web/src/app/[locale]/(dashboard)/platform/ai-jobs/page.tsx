"use client";

import { useEffect, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { PlatformStatCard } from "@/components/platform/stat-card";
import { trpc } from "@/lib/trpc";

type JobsData = Awaited<ReturnType<typeof trpc.platform.aiJobsOverview.query>>;

export default function PlatformAiJobsPage() {
  const [data, setData] = useState<JobsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.aiJobsOverview
      .query()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load AI jobs overview"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="AI Jobs"
        subtitle="Recent AI activity plus draft and failure signals across the product."
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading AI activity…</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <PlatformStatCard label="Recent completed calls" value={data.recentCalls.length} />
              <PlatformStatCard label="Pending social posts" value={data.pendingSocial.length} />
              <PlatformStatCard label="Failed social posts" value={data.failedSocial.length} />
              <PlatformStatCard
                label="Pending landing drafts"
                value={data.pendingLandingDrafts.length}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Recent completed calls</h2>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Tenant", "Prompt", "Model", "Cost", "When"].map((head) => (
                        <th
                          key={head}
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.recentCalls.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.tenantName}</td>
                        <td className="px-4 py-3 text-gray-500">{row.promptId}</td>
                        <td className="px-4 py-3 text-gray-500">{row.model}</td>
                        <td className="px-4 py-3 text-gray-500">
                          ${Number(row.costUsd).toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(row.createdAt).toLocaleString("de-CH")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <div className="space-y-6">
                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Prompt mix</h2>
                  <div className="mt-4 space-y-3">
                    {data.recentPromptMix.map((row) => (
                      <div key={row.promptId} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-900">{row.promptId}</span>
                        <span className="text-gray-500">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Current risk signals</h2>
                  <div className="mt-4 space-y-3">
                    {data.pendingLandingDrafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-sm font-medium text-gray-900">{draft.tenantName}</p>
                        <p className="mt-1 text-xs text-gray-500">{draft.title}</p>
                      </div>
                    ))}
                    {data.failedSocial.map((post) => (
                      <div key={post.id} className="rounded-lg border border-red-100 bg-red-50 p-3">
                        <p className="text-sm font-medium text-red-900">{post.tenantName}</p>
                        <p className="mt-1 text-xs text-red-700">
                          {post.creativeError ?? post.status}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
