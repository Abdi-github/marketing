"use client";

import { useEffect, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { trpc } from "@/lib/trpc";

type IntegrationsData = Awaited<ReturnType<typeof trpc.platform.integrationsOverview.query>>;

export default function PlatformIntegrationsPage() {
  const [data, setData] = useState<IntegrationsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.integrationsOverview
      .query()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load integrations overview"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Integrations"
        subtitle="Cross-tenant visibility into channel and provider health."
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading integrations…</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Connections</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Tenant", "Provider", "Status", "Last sync"].map((head) => (
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
                  {data.connections.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.tenantName}</td>
                      <td className="px-4 py-3 text-gray-500">{row.provider}</td>
                      <td className="px-4 py-3 text-gray-500">{row.status}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString("de-CH") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent sync runs</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Tenant", "Provider", "Status", "Processed", "Error"].map((head) => (
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
                  {data.syncRuns.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.tenantName}</td>
                      <td className="px-4 py-3 text-gray-500">{row.provider}</td>
                      <td className="px-4 py-3 text-gray-500">{row.status}</td>
                      <td className="px-4 py-3 text-gray-500">{row.recordsProcessed}</td>
                      <td className="px-4 py-3 text-gray-500">{row.errorMessage ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
