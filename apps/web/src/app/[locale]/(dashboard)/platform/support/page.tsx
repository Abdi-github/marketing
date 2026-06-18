"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { trpc } from "@/lib/trpc";

type SupportSessions = Awaited<ReturnType<typeof trpc.platform.listSupportSessions.query>>;

export default function PlatformSupportSessionsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [data, setData] = useState<SupportSessions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void trpc.platform.listSupportSessions
      .query()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load support sessions"),
      );
  }, []);

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Support Sessions"
        subtitle="Read-only internal sessions for structured customer support work."
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {error ? <div className="mb-4 text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading support sessions…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Tenant", "Operator", "Reason", "Status", "Started", "Open"].map((head) => (
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
                    <td className="px-4 py-3 text-gray-500">{row.actorEmail}</td>
                    <td className="px-4 py-3 text-gray-500">{row.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{row.status}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(row.startedAt).toLocaleString("de-CH")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/${locale}/admins/support/${row.id}`}
                        className="text-sm font-medium text-violet-700 hover:text-violet-800"
                      >
                        Open
                      </Link>
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
