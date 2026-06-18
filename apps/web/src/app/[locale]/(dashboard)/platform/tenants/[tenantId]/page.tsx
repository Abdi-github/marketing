"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { PlatformStatCard } from "@/components/platform/stat-card";
import { trpc } from "@/lib/trpc";

type TenantDetail = Awaited<ReturnType<typeof trpc.platform.getTenantDetail.query>>;

export default function PlatformTenantDetailPage() {
  const params = useParams<{ locale: string; tenantId: string }>();
  const router = useRouter();
  const { locale, tenantId } = params;
  const [data, setData] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [actionReason, setActionReason] = useState("Manual platform action");
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const result = await trpc.platform.getTenantDetail.query({ tenantId });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenant");
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function runAction(action: "suspend" | "unsuspend" | "review") {
    setPending(action);
    try {
      if (action === "suspend") {
        await trpc.platform.suspendTenant.mutate({ tenantId, reason: actionReason });
      } else if (action === "unsuspend") {
        await trpc.platform.unsuspendTenant.mutate({ tenantId, reason: actionReason });
      } else {
        await trpc.platform.markTenantForReview.mutate({ tenantId, note: actionReason });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
    setPending("note");
    try {
      await trpc.platform.addTenantNote.mutate({ tenantId, body: note.trim(), kind: "support" });
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setPending(null);
    }
  }

  async function startSupportSession() {
    setPending("support");
    try {
      const session = await trpc.platform.startSupportSession.mutate({
        tenantId,
        reason: actionReason,
      });
      if (!session) {
        throw new Error("Support session was not created");
      }
      router.push(`/${locale}/admins/support/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start support session");
      setPending(null);
    }
  }

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title={data ? data.tenant.name : "Tenant detail"}
        subtitle={
          data
            ? `${data.tenant.slug} • ${data.tenant.businessName ?? "No business profile yet"}`
            : "Loading tenant detail…"
        }
        actions={
          <Link
            href={`/${locale}/admins/tenants`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            Back to tenants
          </Link>
        }
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading tenant detail…</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <PlatformStatCard label="Forms" value={data.counts.formsCount} />
              <PlatformStatCard label="Contacts" value={data.counts.contactsCount} />
              <PlatformStatCard label="Pages" value={data.counts.pagesCount} />
              <PlatformStatCard label="Domains" value={data.counts.domainsCount} />
              <PlatformStatCard label="MTD AI spend" value={`$${data.mtdAiSpendUsd.toFixed(2)}`} />
            </div>

            <section className="grid gap-6 xl:grid-cols-[2fr,1fr]">
              <div className="space-y-6">
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Workspace snapshot</h2>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Plan</p>
                      <p className="mt-1 text-sm text-gray-900">{data.tenant.plan}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Status</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {data.tenant.suspended ? "Suspended" : data.tenant.status}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Locale</p>
                      <p className="mt-1 text-sm text-gray-900">{data.tenant.locale ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Vertical</p>
                      <p className="mt-1 text-sm text-gray-900">{data.tenant.vertical ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Created</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(data.tenant.createdAt).toLocaleDateString("de-CH")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500">Billing</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {data.subscription
                          ? `${data.subscription.plan} • ${data.subscription.status}`
                          : "No subscription"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 px-5 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">Team members</h2>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {data.members.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between px-5 py-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                          {member.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-200 px-5 py-4">
                      <h2 className="text-lg font-semibold text-gray-900">Recent AI activity</h2>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {data.recentAiUsage.map((entry) => (
                        <div key={entry.id} className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-900">{entry.promptId}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {entry.provider} · {entry.model} · ${Number(entry.costUsd).toFixed(4)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-200 px-5 py-4">
                      <h2 className="text-lg font-semibold text-gray-900">
                        Domain & integration health
                      </h2>
                    </div>
                    <div className="space-y-4 px-5 py-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-gray-500">Domains</p>
                        <div className="mt-2 space-y-2">
                          {data.domains.length === 0 ? (
                            <p className="text-sm text-gray-500">No domains configured.</p>
                          ) : (
                            data.domains.map((domain) => (
                              <div
                                key={domain.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-gray-900">{domain.hostname}</span>
                                <span className="text-gray-500">{domain.status}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-gray-500">
                          Recent syncs
                        </p>
                        <div className="mt-2 space-y-2">
                          {data.recentSyncs.length === 0 ? (
                            <p className="text-sm text-gray-500">
                              No integration sync activity yet.
                            </p>
                          ) : (
                            data.recentSyncs.map((sync) => (
                              <div
                                key={sync.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-gray-900">{sync.provider}</span>
                                <span className="text-gray-500">{sync.status}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Safe actions</h2>
                  <textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    rows={3}
                    className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="Add an internal reason for this action"
                  />
                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(data.tenant.suspended ? "unsuspend" : "suspend")
                      }
                      disabled={pending !== null}
                      className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {data.tenant.suspended ? "Unsuspend tenant" : "Suspend tenant"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction("review")}
                      disabled={pending !== null}
                      className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      Mark for review
                    </button>
                    <button
                      type="button"
                      onClick={() => void startSupportSession()}
                      disabled={pending !== null}
                      className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                    >
                      Start read-only support session
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Internal notes</h2>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="Capture support context, follow-up, or compliance notes"
                  />
                  <button
                    type="button"
                    onClick={() => void saveNote()}
                    disabled={pending !== null}
                    className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    Save note
                  </button>
                  <div className="mt-4 space-y-3">
                    {data.notes.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <p className="text-sm text-gray-900">{entry.body}</p>
                        <p className="mt-2 text-xs text-gray-500">
                          {entry.authorName} · {new Date(entry.createdAt).toLocaleString("de-CH")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
