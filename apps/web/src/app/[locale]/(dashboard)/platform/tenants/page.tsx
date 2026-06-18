"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { trpc } from "@/lib/trpc";

type TenantListResult = Awaited<ReturnType<typeof trpc.platform.listTenants.query>>;

export default function PlatformTenantsPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "under_review" | "suspended">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TenantListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.listTenants
      .query({ query, status, page, pageSize: 12 })
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load tenants"),
      );
  }, [page, query, status]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Tenants"
        subtitle="Search, inspect, and safely intervene in customer workspaces."
      />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="Search by tenant name or slug"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-0 focus:border-violet-400"
            />
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {(["all", "active", "under_review", "suspended"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setStatus(value);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    status === value ? "bg-white text-violet-700 shadow-sm" : "text-gray-600"
                  }`}
                >
                  {value.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading tenants…</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "Tenant",
                      "Slug",
                      "Plan",
                      "Vertical",
                      "Locale",
                      "Status",
                      "Created",
                      "Open",
                    ].map((head) => (
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
                  {data.items.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{tenant.name}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.slug}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.plan}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.vertical ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{tenant.locale ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            tenant.suspended
                              ? "bg-red-100 text-red-700"
                              : tenant.status === "under_review"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-green-100 text-green-700"
                          }`}
                        >
                          {tenant.suspended ? "Suspended" : tenant.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(tenant.createdAt).toLocaleDateString("de-CH")}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/${locale}/admins/tenants/${tenant.id}`}
                          className="text-sm font-medium text-violet-700 hover:text-violet-800"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-500">
                Page {data.page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
