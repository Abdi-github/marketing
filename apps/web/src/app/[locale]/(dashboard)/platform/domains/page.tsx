"use client";

import { useEffect, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { trpc } from "@/lib/trpc";

type DomainsData = Awaited<ReturnType<typeof trpc.platform.domainsOverview.query>>;

export default function PlatformDomainsPage() {
  const [data, setData] = useState<DomainsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.domainsOverview
      .query()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load domains overview"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Domains & Publishing"
        subtitle="Platform visibility into custom domain and certificate readiness."
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {error ? <div className="mb-4 text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading domains…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Tenant", "Hostname", "Status", "Primary", "Cert expiry"].map((head) => (
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
                {data.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.tenantName}</td>
                    <td className="px-4 py-3 text-gray-500">{row.hostname}</td>
                    <td className="px-4 py-3 text-gray-500">{row.status}</td>
                    <td className="px-4 py-3 text-gray-500">{row.isPrimary ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.certExpiresAt
                        ? new Date(row.certExpiresAt).toLocaleDateString("de-CH")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
