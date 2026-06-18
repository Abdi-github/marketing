"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { PlatformStatCard } from "@/components/platform/stat-card";

type OverviewData = Awaited<ReturnType<typeof trpc.platform.overview.query>>;

export default function PlatformOverviewPage() {
  const { locale } = useParams<{ locale: string }>();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.overview
      .query()
      .then((result) => setData(result))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load platform overview"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Admin Control Dashboard"
        subtitle="Internal tenant, billing, AI, and publishing oversight."
        actions={
          <Link
            href={`/${locale}/admins/tenants`}
            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Open tenants
          </Link>
        }
      />

      {error ? <div className="p-6 text-sm text-red-600">{error}</div> : null}

      {!data ? (
        <div className="p-6 text-sm text-gray-500">Loading overview…</div>
      ) : (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PlatformStatCard label="Tenants" value={data.totals.tenants} />
            <PlatformStatCard label="Suspended tenants" value={data.totals.suspendedTenants} />
            <PlatformStatCard label="Platform users" value={data.totals.platformUsers} />
            <PlatformStatCard
              label="MTD AI cost"
              value={`$${data.totals.mtdAiCostUsd.toFixed(2)}`}
              hint="Across all tenants this month"
            />
            <PlatformStatCard
              label="Active subscriptions"
              value={data.totals.activeSubscriptions}
            />
            <PlatformStatCard label="Live domains" value={data.totals.liveDomains} />
            <PlatformStatCard
              label="Open support sessions"
              value={data.totals.activeSupportSessions}
            />
            <PlatformStatCard label="Failed syncs (7d)" value={data.totals.failedSyncs7d} />
          </div>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Recently created tenants</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Tenant", "Slug", "Plan", "Vertical", "Suspended", "Created"].map((head) => (
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
                  {data.recentTenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{tenant.name}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.slug}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.plan}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.vertical ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            tenant.suspended
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {tenant.suspended ? "Suspended" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(tenant.createdAt).toLocaleDateString("de-CH")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
