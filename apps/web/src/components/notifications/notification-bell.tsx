"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type NotificationRow = Awaited<ReturnType<typeof trpc.notifications.list.query>>[number];
type NotificationPreferences = NonNullable<
  Awaited<ReturnType<typeof trpc.notifications.getPreferences.query>>
>;

function formatTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

function priorityTone(priority: string): string {
  if (priority === "high") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function currentLocale(): string {
  if (typeof window === "undefined") return "en";
  const segment = window.location.pathname.split("/").filter(Boolean)[0];
  return segment && ["de", "en", "fr", "it"].includes(segment) ? segment : "en";
}

function normalizeActionUrl(actionUrl: string | null): string | null {
  if (!actionUrl) return null;
  if (typeof window === "undefined") return actionUrl;

  try {
    const url = new URL(actionUrl, window.location.origin);
    if (url.origin !== window.location.origin) return null;

    const locale = currentLocale();
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0];
    const pathWithoutLocale =
      first && ["de", "en", "fr", "it"].includes(first)
        ? `/${parts.slice(1).join("/")}`
        : url.pathname;
    const normalizedPath =
      pathWithoutLocale === "/" ? `/${locale}` : `/${locale}${pathWithoutLocale}`;
    return `${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [staffSmsPhone, setStaffSmsPhone] = useState("");
  const [savingPreferences, setSavingPreferences] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        trpc.notifications.list.query({ limit: 12 }),
        trpc.notifications.unreadCount.query(),
      ]);
      setRows(list);
      setUnread(count.total);
      if (!preferences) {
        const prefs = await trpc.notifications.getPreferences.query();
        if (prefs) {
          setPreferences(prefs);
          setStaffSmsPhone(prefs.staffSmsPhone ?? "");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleRows = useMemo(() => rows.filter((row) => !row.dismissedAt), [rows]);

  async function markRead(notificationId: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === notificationId
          ? { ...row, status: "read", readAt: new Date().toISOString() }
          : row,
      ),
    );
    setUnread((value) => Math.max(0, value - 1));
    await trpc.notifications.markRead.mutate({ notificationId }).catch(() => void load());
  }

  async function dismiss(notificationId: string) {
    setRows((current) => current.filter((row) => row.id !== notificationId));
    await trpc.notifications.dismiss.mutate({ notificationId }).catch(() => void load());
  }

  async function savePreferences() {
    if (!preferences) return;
    setSavingPreferences(true);
    try {
      await trpc.notifications.updatePreferences.mutate({
        inAppEnabled: preferences.inAppEnabled,
        staffSmsEnabled: preferences.staffSmsEnabled,
        staffSmsPhone: staffSmsPhone.trim() || null,
      });
      await load();
    } catch {
      await load();
    } finally {
      setSavingPreferences(false);
    }
  }

  return (
    <div className="fixed right-4 top-4 z-40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
        aria-label="Open notifications"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {unread > 0 && (
          <span className="min-h-5 min-w-5 absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Staff notifications</p>
              <p className="text-xs text-slate-500">New leads and follow-up work appear here.</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>

          <div className="border-b border-slate-100 px-4 py-2">
            <button
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-950"
            >
              {settingsOpen ? "Hide alert settings" : "Alert settings"}
            </button>
            {settingsOpen && preferences && (
              <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
                  <span>Show in-app alerts</span>
                  <input
                    type="checkbox"
                    checked={preferences.inAppEnabled}
                    onChange={(event) =>
                      setPreferences({ ...preferences, inAppEnabled: event.target.checked })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
                  <span>Send important alerts by SMS</span>
                  <input
                    type="checkbox"
                    checked={preferences.staffSmsEnabled}
                    onChange={(event) =>
                      setPreferences({ ...preferences, staffSmsEnabled: event.target.checked })
                    }
                  />
                </label>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Staff SMS phone
                  </label>
                  <input
                    type="tel"
                    value={staffSmsPhone}
                    onChange={(event) => setStaffSmsPhone(event.target.value)}
                    placeholder="+41761234567"
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Leave empty to use the verified business phone from SMS settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void savePreferences()}
                  disabled={savingPreferences}
                  className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingPreferences ? "Saving" : "Save alert settings"}
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-3">
            {visibleRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No staff alerts yet. New website leads, customer replies, and failed automations
                will appear here.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleRows.map((row) => {
                  const actionUrl = normalizeActionUrl(row.actionUrl);
                  return (
                    <div
                      key={row.id}
                      className={`rounded-lg border p-3 ${priorityTone(row.priority)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{row.title}</p>
                          {row.body && <p className="mt-1 text-xs leading-relaxed">{row.body}</p>}
                          <p className="mt-2 text-[11px] opacity-75">{formatTime(row.createdAt)}</p>
                        </div>
                        {row.status === "unread" && (
                          <span className="mt-0.5 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            New
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actionUrl && (
                          <a
                            href={actionUrl}
                            onClick={() => void markRead(row.id)}
                            className="rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Open
                          </a>
                        )}
                        {row.status === "unread" && (
                          <button
                            type="button"
                            onClick={() => void markRead(row.id)}
                            className="rounded-md border border-current px-2.5 py-1.5 text-xs font-semibold"
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void dismiss(row.id)}
                          className="rounded-md border border-current px-2.5 py-1.5 text-xs font-semibold opacity-75"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
