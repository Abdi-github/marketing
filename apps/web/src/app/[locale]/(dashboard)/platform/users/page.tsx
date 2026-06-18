"use client";

import { useEffect, useState } from "react";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { PLATFORM_ROLE_LABELS } from "@/lib/platform-access";
import { trpc } from "@/lib/trpc";

type PlatformUsers = Awaited<ReturnType<typeof trpc.platform.listPlatformUsers.query>>;

export default function PlatformUsersPage() {
  const [data, setData] = useState<PlatformUsers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setData(await trpc.platform.listPlatformUsers.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform users");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateRole(userId: string, role: string) {
    setPendingUserId(userId);
    try {
      if (role === "none") {
        await trpc.platform.clearPlatformRole.mutate({ userId });
      } else {
        await trpc.platform.setPlatformRole.mutate({
          userId,
          role: role as "super_admin" | "support_admin" | "operations_admin" | "finance_admin",
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title="Platform users"
        subtitle="Assign and review internal admin access."
      />

      <div className="p-4 sm:p-6 lg:p-8">
        {error ? <div className="mb-4 text-sm text-red-600">{error}</div> : null}

        {!data ? (
          <div className="text-sm text-gray-500">Loading platform users…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Name", "Email", "Role", "Last active", "Manage"].map((head) => (
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
                {data.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.platformRole ? (
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700">
                          {
                            PLATFORM_ROLE_LABELS[
                              user.platformRole as keyof typeof PLATFORM_ROLE_LABELS
                            ]
                          }
                        </span>
                      ) : (
                        <span className="text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString("de-CH") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.platformRole ?? "none"}
                        onChange={(e) => void updateRole(user.id, e.target.value)}
                        disabled={pendingUserId === user.id}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="none">No platform access</option>
                        <option value="super_admin">Super admin</option>
                        <option value="support_admin">Support admin</option>
                        <option value="operations_admin">Operations admin</option>
                        <option value="finance_admin">Finance admin</option>
                      </select>
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
