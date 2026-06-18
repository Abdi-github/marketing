"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PlatformPageHeader } from "@/components/platform/page-header";
import { trpc } from "@/lib/trpc";

type SupportDetail = Awaited<ReturnType<typeof trpc.platform.getSupportSessionDetail.query>>;

export default function PlatformSupportSessionDetailPage() {
  const { locale, sessionId } = useParams<{ locale: string; sessionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SupportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    try {
      setError(null);
      setData(await trpc.platform.getSupportSessionDetail.query({ sessionId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load support session");
    }
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  async function endSession() {
    setPending(true);
    try {
      await trpc.platform.endSupportSession.mutate({
        sessionId,
        reason: "Support session closed from control panel",
      });
      router.push(`/${locale}/admins/support`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end support session");
      setPending(false);
    }
  }

  return (
    <div className="min-h-full">
      <PlatformPageHeader
        title={data ? `Support session · ${data.session.tenantName}` : "Support session"}
        subtitle="Read-only support workspace for internal operators."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/admins/support`}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
            >
              Back
            </Link>
            <button
              type="button"
              onClick={() => void endSession()}
              disabled={pending}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              End session
            </button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          You are in a read-only support session. This workspace is for inspection, not tenant
          edits.
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!data ? (
          <div className="text-sm text-gray-500">Loading support workspace…</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Session info</h2>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm">
                <p>
                  <span className="font-medium text-gray-900">Operator:</span>{" "}
                  {data.session.actorEmail}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Reason:</span>{" "}
                  {data.session.reason ?? "—"}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Status:</span> {data.session.status}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Started:</span>{" "}
                  {new Date(data.session.startedAt).toLocaleString("de-CH")}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Expires:</span>{" "}
                  {new Date(data.session.expiresAt).toLocaleString("de-CH")}
                </p>
              </div>
            </section>
            <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent tenant assets</h2>
              </div>
              <div className="space-y-4 px-5 py-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">Landing pages</p>
                  <div className="mt-2 space-y-2">
                    {data.landingPages.map((row) => (
                      <div key={row.id} className="text-sm text-gray-900">
                        {row.title} <span className="text-gray-500">({row.status})</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500">Forms</p>
                  <div className="mt-2 space-y-2">
                    {data.forms.map((row) => (
                      <div key={row.id} className="text-sm text-gray-900">
                        {row.name}{" "}
                        <span className="text-gray-500">
                          ({row.isActive ? "active" : "inactive"})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
