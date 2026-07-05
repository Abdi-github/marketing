"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc/routers";

type Sequence = {
  id: string;
  name: string;
  triggerEvent: string;
  status: string;
  stepsCount: number;
  activeEnrollments: number;
  createdAt: string;
};

function trpc() {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/api/trpc" })],
  });
}

const TRIGGER_LABELS: Record<string, string> = {
  "lead.captured": "Lead captured",
  "contact.score_changed": "Score changed",
  "contact.lifecycle_changed": "Lifecycle changed",
  manual: "Manual",
};

export function SequencesList({
  initialSequences,
  locale,
  senderReady,
}: {
  initialSequences: Sequence[];
  locale: string;
  senderReady: boolean;
}) {
  const t = useTranslations("Sequences");
  const router = useRouter();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  async function toggleStatus(seq: Sequence) {
    if (seq.status !== "active" && !senderReady) {
      setNotice({
        tone: "warning",
        text: "Configure a production sender before resuming this sequence.",
      });
      return;
    }
    setTogglingId(seq.id);
    setNotice(null);
    try {
      const newStatus = seq.status === "active" ? "paused" : "active";
      await trpc().sequences.updateSequence.mutate({ sequenceId: seq.id, status: newStatus });
      setNotice({
        tone: "success",
        text: newStatus === "active" ? "Sequence resumed." : "Sequence paused.",
      });
      router.refresh(); // re-runs the server component to get fresh data
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Could not update sequence status.",
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteSequence(seq: Sequence) {
    setDeletingId(seq.id);
    setNotice(null);
    try {
      await trpc().sequences.deleteSequence.mutate({ sequenceId: seq.id });
      setNotice({ tone: "success", text: "Sequence deleted." });
      setConfirmDeleteId(null);
      router.refresh();
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : t("deleteError"),
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (initialSequences.length === 0) {
    return (
      <div className="py-16 text-center text-gray-500">
        <p className="text-sm">{t("empty")}</p>
        <Link
          href={`/${locale}/sequences/new`}
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          {t("createFirst")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : notice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("colName")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("colTrigger")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("colSteps")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("colEnrollments")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("colStatus")}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {initialSequences.map((seq) => (
              <Fragment key={seq.id}>
                <tr className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/sequences/${seq.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {seq.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {TRIGGER_LABELS[seq.triggerEvent] ?? seq.triggerEvent}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{seq.stepsCount}</td>
                  <td className="px-4 py-3 text-gray-500">{seq.activeEnrollments}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        seq.status === "active"
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {seq.status === "active" ? t("statusActive") : t("statusPaused")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleStatus(seq)}
                        disabled={
                          togglingId === seq.id || (seq.status !== "active" && !senderReady)
                        }
                        title={
                          seq.status !== "active" && !senderReady
                            ? "Configure a production sender before resuming."
                            : undefined
                        }
                        className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40"
                      >
                        {seq.status === "active" ? t("pause") : t("resume")}
                      </button>
                      <Link
                        href={`/${locale}/sequences/${seq.id}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {t("edit")}
                      </Link>
                      <button
                        onClick={() => setConfirmDeleteId(seq.id)}
                        disabled={deletingId === seq.id || seq.activeEnrollments > 0}
                        title={seq.activeEnrollments > 0 ? t("deleteBlockedTooltip") : undefined}
                        className="text-xs text-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
                {confirmDeleteId === seq.id && (
                  <tr key={`${seq.id}-confirm`} className="border-b border-red-100 bg-red-50">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
                        <span>{t("deleteConfirm")}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSequence(seq)}
                            disabled={deletingId === seq.id}
                            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingId === seq.id ? "Deleting..." : t("delete")}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
