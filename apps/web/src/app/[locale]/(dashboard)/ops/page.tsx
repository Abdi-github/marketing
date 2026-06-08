"use client";

import React, { useState, useEffect, useCallback } from "react";
import { trpc } from "../../../../lib/trpc";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  suspended: boolean;
  erasedAt: string | null;
  createdAt: string;
};

export default function OpsPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.ops.listTenants.query();
      setTenants(result as Tenant[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  async function loadUsage(tenantId: string) {
    try {
      const result = await trpc.ops.getTenantUsage.query({ tenantId });
      setUsageMap((prev) => ({ ...prev, [tenantId]: result.mtdSpendUsd }));
    } catch {
      // ignore — usage is lazy/optional
    }
  }

  async function handleSuspend(tenantId: string, name: string) {
    if (!confirm(`Suspend tenant "${name}"? AI jobs will be blocked.`)) return;
    setPendingAction(tenantId);
    try {
      await trpc.ops.suspendTenant.mutate({ tenantId });
      await fetchTenants();
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUnsuspend(tenantId: string) {
    setPendingAction(tenantId);
    try {
      await trpc.ops.unsuspendTenant.mutate({ tenantId });
      await fetchTenants();
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading tenants…</div>;
  if (error) return <div className="p-8 text-sm text-red-600">Error: {error}</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Ops — Tenant Management</h1>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Name", "Slug", "Plan", "Status", "Suspended", "MTD AI Cost", "Created", "Actions"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants?.map((t) => (
              <tr key={t.id} className={t.suspended ? "bg-red-50" : undefined}>
                <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                <td className="px-4 py-3 text-gray-500">{t.slug}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{t.status}</td>
                <td className="px-4 py-3">
                  {t.suspended ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Suspended
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {usageMap[t.id] !== undefined ? (
                    `$${usageMap[t.id]!.toFixed(4)}`
                  ) : (
                    <button
                      onClick={() => void loadUsage(t.id)}
                      className="text-xs text-blue-600 underline"
                    >
                      Load
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(t.createdAt).toLocaleDateString("de-CH")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {t.suspended ? (
                      <button
                        onClick={() => void handleUnsuspend(t.id)}
                        disabled={pendingAction === t.id}
                        className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                      >
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleSuspend(t.id, t.name)}
                        disabled={pendingAction === t.id}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
