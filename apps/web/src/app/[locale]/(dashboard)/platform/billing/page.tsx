"use client";

import { useEffect, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { PlatformStatCard } from "@/components/platform/stat-card";
import { trpc } from "@/lib/trpc";

type BillingData = Awaited<ReturnType<typeof trpc.platform.billingOverview.query>>;

export default function PlatformBillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.billingOverview
      .query()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load billing overview"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Billing & Usage"
        subtitle="Cross-tenant subscription, invoice, and AI spend visibility."
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading billing data…</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <PlatformStatCard label="MTD AI cost" value={`$${data.mtdAiCostUsd.toFixed(2)}`} />
              <PlatformStatCard label="Tracked subscriptions" value={data.subscriptions.length} />
              <PlatformStatCard label="Recent invoices" value={data.invoices.length} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Subscriptions</h2>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Tenant", "Plan", "Status", "Renews"].map((head) => (
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
                    {data.subscriptions.map((row) => (
                      <tr key={`${row.tenantId}-${row.plan}-${row.currentPeriodEnd}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.tenantName}</td>
                        <td className="px-4 py-3 text-gray-500">{row.plan}</td>
                        <td className="px-4 py-3 text-gray-500">{row.status}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(row.currentPeriodEnd).toLocaleDateString("de-CH")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">Recent invoices</h2>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Tenant", "Amount", "Status", "Created"].map((head) => (
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
                    {data.invoices.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.tenantName}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {(row.amountCents / 100).toFixed(2)} {row.currency.toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{row.status}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(row.createdAt).toLocaleDateString("de-CH")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
