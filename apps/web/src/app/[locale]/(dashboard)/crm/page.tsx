"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { trpc } from "../../../../lib/trpc";

type LifecycleStage = "subscriber" | "lead" | "mql" | "sql" | "customer" | "evangelist";
type EmailStatus = "active" | "unsubscribed" | "bounced" | "complained";

const LIFECYCLE_STAGES: LifecycleStage[] = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "customer",
  "evangelist",
];

type ContactRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  tags: string[];
  source: string;
  lifecycleStage: LifecycleStage;
  leadScore: number;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  leadCount: number;
  emailStatus: EmailStatus;
  emailSuppressedAt: Date | string | null;
};

type LeadEntry = {
  id: string;
  submittedAt: Date | string;
  sourceUrl: string | null;
  payload: unknown;
  status: "new" | "contacted" | "confirmed" | "qualified" | "archived" | null;
  workflowKind: "booking" | "callback" | "quote" | "generic" | null;
  workflowState:
    | "received"
    | "missing_details"
    | "awaiting_confirmation"
    | "contacted"
    | "confirmed"
    | "declined"
    | "cancelled"
    | "manual_review"
    | null;
  sourceChannel: string | null;
  structuredData: Record<string, unknown> | null;
};

type ContactDetail = ContactRow & {
  phone: string | null;
  notes: string | null;
  customProperties: Record<string, unknown>;
  emailSuppressionSource: string | null;
  leads: LeadEntry[];
};

type ListResult = {
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function displayName(c: { firstName?: string | null; lastName?: string | null; email: string }) {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return n || c.email;
}

function emailStatusLabel(status: EmailStatus) {
  switch (status) {
    case "unsubscribed":
      return "Unsubscribed";
    case "bounced":
      return "Bounced";
    case "complained":
      return "Complaint";
    default:
      return "Email active";
  }
}

function emailStatusClass(status: EmailStatus) {
  switch (status) {
    case "unsubscribed":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "bounced":
      return "border-red-200 bg-red-50 text-red-700";
    case "complained":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function EmailStatusBadge({
  status,
  suppressedAt,
}: {
  status: EmailStatus;
  suppressedAt?: Date | string | null;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${emailStatusClass(
        status,
      )}`}
      title={suppressedAt ? `Since ${formatDate(suppressedAt)}` : undefined}
    >
      {emailStatusLabel(status)}
    </span>
  );
}

// ── Add Contact Modal ──────────────────────────────────────────────────────────

function AddContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("CRM");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await trpc.contacts.create.mutate({
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      setError(msg.includes("CONFLICT") ? t("conflictError") : t("createError"));
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">{t("addContactTitle")}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t("emailLabel")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("firstNameLabel")}
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("lastNameLabel")}
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t("phoneLabel")}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t("notesFieldLabel")}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-4 py-2 text-sm transition-colors hover:bg-gray-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={creating || !email.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? t("creating") : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

// ── Score sparkline (SVG) ──────────────────────────────────────────────────────

type ScoreHistoryRow = {
  score: number;
  previousScore: number;
  reasoning: string | null;
  scoredAt: Date | string;
};
type TimelineItem = {
  id: string;
  kind:
    | "lead"
    | "event"
    | "score"
    | "message"
    | "deal"
    | "deal_activity"
    | "email"
    | "sequence"
    | "task";
  title: string;
  body: string | null;
  occurredAt: Date | string;
  meta: Record<string, unknown>;
};
type TaskRow = {
  id: string;
  title: string;
  body: string | null;
  dueAt: Date | string | null;
  status: "open" | "done";
  priority: "low" | "normal" | "high";
  completedAt: Date | string | null;
  createdAt: Date | string;
};
type OpenTaskRow = TaskRow & {
  contactId: string;
  dealId: string | null;
  contactEmail: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  meta: Record<string, unknown> | null;
  duplicateCount?: number;
};

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function formatDateInputValue(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueDateInputToTaskDueAt(value: string) {
  return value ? `${value}T09:00:00` : null;
}

function buildSnoozeDueAt(days: number) {
  const dueAt = addDays(startOfLocalDay(new Date()), days);
  dueAt.setHours(9, 0, 0, 0);
  return dueAt.toISOString();
}

function taskContactName(task: OpenTaskRow) {
  return (
    [task.contactFirstName, task.contactLastName].filter(Boolean).join(" ") || task.contactEmail
  );
}

function taskMetaValue(task: OpenTaskRow, key: string) {
  const value = task.meta?.[key];
  return typeof value === "string" ? value : null;
}

function taskLeadId(task: OpenTaskRow) {
  return taskMetaValue(task, "latestLeadId") ?? taskMetaValue(task, "leadId");
}

function taskCanConfirmReservation(task: OpenTaskRow) {
  if (taskMetaValue(task, "workflowKind") !== "booking") return false;
  const state = taskMetaValue(task, "workflowState");
  return state === "awaiting_confirmation" || state === "contacted" || state === "missing_details";
}

function ScoreSparkline({ history }: { history: ScoreHistoryRow[] }) {
  if (history.length < 2) return null;
  const pts = [...history].reverse(); // oldest first for left-to-right
  const W = 120,
    H = 32,
    pad = 2;
  const maxV = Math.max(...pts.map((p) => p.score), 10);
  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (W - pad * 2);
    const y = H - pad - (p.score / maxV) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function timelineBadgeClass(kind: TimelineItem["kind"]): string {
  switch (kind) {
    case "lead":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "message":
      return "bg-sky-50 text-sky-700 border-sky-100";
    case "deal":
    case "deal_activity":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "email":
    case "sequence":
      return "bg-violet-50 text-violet-700 border-violet-100";
    case "score":
      return "bg-lime-50 text-lime-700 border-lime-100";
    case "task":
      return "bg-rose-50 text-rose-700 border-rose-100";
    default:
      return "bg-gray-50 text-gray-700 border-gray-100";
  }
}

function timelineKindLabel(kind: TimelineItem["kind"]): string {
  return kind.replace("_", " ");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function valueAsText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function valueFromKeys(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = valueAsText(source[key]);
    if (direct) return direct;
    const lowerKey = Object.keys(source).find((candidate) => candidate.toLowerCase() === key);
    if (lowerKey) {
      const value = valueAsText(source[lowerKey]);
      if (value) return value;
    }
  }
  return null;
}

function prettyFieldName(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function leadPayloadRecord(lead: LeadEntry): Record<string, unknown> {
  return { ...asObject(lead.payload), ...asObject(lead.structuredData) };
}

function leadMessage(lead: LeadEntry): string {
  const data = leadPayloadRecord(lead);
  return (
    valueFromKeys(data, [
      "message",
      "notes",
      "note",
      "request",
      "details",
      "comment",
      "comments",
    ]) ?? "No written message was included. Use the request details below to follow up."
  );
}

function leadImportantFields(lead: LeadEntry): Array<{ label: string; value: string }> {
  const data = leadPayloadRecord(lead);
  const fields = [
    ["Name", ["name", "fullName", "customerName"]],
    ["Email", ["email"]],
    ["Phone", ["phone", "tel", "mobile"]],
    ["Preferred channel", ["preferredChannel", "preferred_channel", "channel", "contactMethod"]],
    ["Date", ["date", "preferredDate", "preferred_date", "reservationDate"]],
    ["Time", ["time", "preferredTime", "preferred_time", "reservationTime"]],
    ["People", ["partySize", "party_size", "guests", "people", "numberOfPeople"]],
  ]
    .map(([label, keys]) => ({
      label: label as string,
      value: valueFromKeys(data, keys as string[]),
    }))
    .filter((field): field is { label: string; value: string } => Boolean(field.value));

  const knownKeys = new Set(
    [
      "name",
      "fullname",
      "customername",
      "email",
      "phone",
      "tel",
      "mobile",
      "preferredchannel",
      "preferred_channel",
      "channel",
      "contactmethod",
      "date",
      "preferreddate",
      "preferred_date",
      "reservationdate",
      "time",
      "preferredtime",
      "preferred_time",
      "reservationtime",
      "partysize",
      "party_size",
      "guests",
      "people",
      "numberofpeople",
      "message",
      "notes",
      "note",
      "request",
      "details",
      "comment",
      "comments",
    ].map((key) => key.toLowerCase()),
  );
  const extraFields = Object.entries(data)
    .filter(([key, value]) => !knownKeys.has(key.toLowerCase()) && Boolean(valueAsText(value)))
    .slice(0, 6)
    .map(([key, value]) => ({ label: prettyFieldName(key), value: valueAsText(value)! }));

  return [...fields, ...extraFields].slice(0, 10);
}

function workflowLabel(lead: LeadEntry): string {
  const kind = lead.workflowKind === "booking" ? "reservation" : (lead.workflowKind ?? "lead");
  const state = (lead.workflowState ?? lead.status ?? "new").replaceAll("_", " ");
  return `${kind} - ${state}`;
}

function staffNextStep(lead: LeadEntry): string {
  if (lead.workflowKind === "booking") {
    if (lead.workflowState === "missing_details") {
      return "Ask the customer for the missing date, time, or number of guests before confirming.";
    }
    if (lead.workflowState === "confirmed") {
      return "The reservation is confirmed. Keep the contact history for reminders or future visits.";
    }
    if (lead.workflowState === "declined" || lead.workflowState === "cancelled") {
      return "This request is closed. No booking confirmation should be sent.";
    }
    return "Review the request, check availability, then contact the customer or confirm the reservation.";
  }
  if (lead.workflowKind === "quote") {
    return "Review the request and create a deal if this could become a valuable booking or event.";
  }
  if (lead.workflowKind === "callback") {
    return "Call or message the customer, then mark the task complete after follow-up.";
  }
  return "Read the customer message and reply from the right channel or create a follow-up task.";
}

function LatestLeadSummary({
  lead,
  tasks,
  updatingLeadId,
  onLeadWorkflowStatus,
}: {
  lead: LeadEntry;
  tasks: TaskRow[];
  updatingLeadId: string | null;
  onLeadWorkflowStatus: (
    lead: LeadEntry,
    input: {
      status: "new" | "contacted" | "confirmed" | "qualified" | "archived";
      workflowState:
        | "received"
        | "missing_details"
        | "awaiting_confirmation"
        | "contacted"
        | "confirmed"
        | "declined"
        | "cancelled"
        | "manual_review";
    },
  ) => void;
}) {
  const fields = leadImportantFields(lead);
  const openTasks = tasks.filter((task) => task.status === "open");
  const canConfirm = lead.workflowKind === "booking" && lead.workflowState !== "confirmed";

  return (
    <section className="rounded-xl border border-violet-100 bg-violet-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Latest customer request
          </p>
          <h3 className="mt-1 text-base font-semibold capitalize text-slate-950">
            {workflowLabel(lead)}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Submitted {formatDate(lead.submittedAt)}
            {lead.sourceChannel ? ` from ${lead.sourceChannel.replaceAll("_", " ")}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold capitalize text-violet-700">
          {(lead.workflowState ?? lead.status ?? "new").replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-violet-100 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Customer message
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
          {leadMessage(lead)}
        </p>
      </div>

      {fields.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={`${field.label}:${field.value}`} className="rounded-lg bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {field.label}
              </p>
              <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{field.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Recommended next step
        </p>
        <p className="mt-1 text-sm leading-relaxed text-amber-900">{staffNextStep(lead)}</p>
        {openTasks.length > 0 && (
          <p className="mt-1 text-xs text-amber-800">
            Open staff tasks for this customer: {openTasks.length}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            onLeadWorkflowStatus(lead, {
              status: "contacted",
              workflowState: "contacted",
            })
          }
          disabled={updatingLeadId === lead.id || lead.workflowState === "confirmed"}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Mark contacted
        </button>
        {canConfirm && (
          <button
            type="button"
            onClick={() =>
              onLeadWorkflowStatus(lead, {
                status: "confirmed",
                workflowState: "confirmed",
              })
            }
            disabled={updatingLeadId === lead.id}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Confirm reservation
          </button>
        )}
        {canConfirm && (
          <button
            type="button"
            onClick={() =>
              onLeadWorkflowStatus(lead, {
                status: "archived",
                workflowState: "declined",
              })
            }
            disabled={updatingLeadId === lead.id}
            className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
          >
            Decline
          </button>
        )}
      </div>
    </section>
  );
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({
  contactId,
  onClose,
  onUpdated,
}: {
  contactId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const t = useTranslations("CRM");
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const [savingStage, setSavingStage] = useState(false);
  const [stageSaved, setStageSaved] = useState(false);

  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "normal" | "high">("normal");
  const [savingTask, setSavingTask] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const [draft, setDraft] = useState<string | null>(null);
  const [draftingFollowUp, setDraftingFollowUp] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    trpc.contacts.get
      .query({ contactId })
      .then((d) => {
        setDetail(d as unknown as ContactDetail);
        setNotes(d.notes ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Load score history + unified activity timeline in parallel (best-effort).
    trpc.contacts.getScoreHistory
      .query({ contactId })
      .then((r) => setScoreHistory(r as ScoreHistoryRow[]))
      .catch(() => null);
    trpc.contacts.getTimeline
      .query({ contactId })
      .then((r) => setTimeline(r as TimelineItem[]))
      .catch(() => null);
    trpc.contacts.listTasks
      .query({ contactId })
      .then((r) => setTasks(r as TaskRow[]))
      .catch(() => null);
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStageChange(stage: LifecycleStage) {
    if (!detail || detail.lifecycleStage === stage) return;
    setSavingStage(true);
    setStageSaved(false);
    setDetail({ ...detail, lifecycleStage: stage }); // optimistic
    try {
      await trpc.contacts.update.mutate({ contactId, lifecycleStage: stage });
      setStageSaved(true);
      setTimeout(() => setStageSaved(false), 1500);
      onUpdated();
    } catch {
      // revert on failure
      load();
    } finally {
      setSavingStage(false);
    }
  }

  async function handleAddTag() {
    const tag = tagInput.trim();
    if (!tag || addingTag) return;
    setAddingTag(true);
    await trpc.contacts.addTag.mutate({ contactId, tag }).catch(() => null);
    setTagInput("");
    setAddingTag(false);
    load();
    onUpdated();
  }

  async function handleRemoveTag(tag: string) {
    await trpc.contacts.removeTag.mutate({ contactId, tag }).catch(() => null);
    load();
    onUpdated();
  }

  function handleNotesChange(val: string) {
    setNotes(val);
    setNotesSaved(false);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setSavingNotes(true);
      await trpc.contacts.updateNotes.mutate({ contactId, notes: val }).catch(() => null);
      setSavingNotes(false);
      setNotesSaved(true);
    }, 800);
  }

  async function handleDraftFollowUp() {
    setDraftingFollowUp(true);
    setDraft(null);
    try {
      const result = await trpc.contacts.draftFollowUp.mutate({ contactId });
      setDraft(result.draft);
    } catch {
      setDraft("—");
    }
    setDraftingFollowUp(false);
  }

  function handleCopyDraft() {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setDraftCopied(true);
      setTimeout(() => setDraftCopied(false), 2000);
    });
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title || savingTask) return;

    setSavingTask(true);
    try {
      await trpc.contacts.createTask.mutate({
        contactId,
        title,
        dueAt: taskDueAt || undefined,
        priority: taskPriority,
      });
      setTaskTitle("");
      setTaskDueAt("");
      setTaskPriority("normal");
      load();
      onUpdated();
    } finally {
      setSavingTask(false);
    }
  }

  async function handleToggleTask(task: TaskRow) {
    await trpc.contacts.updateTaskStatus.mutate({
      taskId: task.id,
      done: task.status !== "done",
    });
    load();
    onUpdated();
  }

  async function handleDeleteTask(taskId: string) {
    await trpc.contacts.deleteTask.mutate({ taskId }).catch(() => null);
    load();
    onUpdated();
  }

  async function handleLeadWorkflowStatus(
    lead: LeadEntry,
    input: {
      status: "new" | "contacted" | "confirmed" | "qualified" | "archived";
      workflowState:
        | "received"
        | "missing_details"
        | "awaiting_confirmation"
        | "contacted"
        | "confirmed"
        | "declined"
        | "cancelled"
        | "manual_review";
    },
  ) {
    setUpdatingLeadId(lead.id);
    await trpc.inbox.updateLeadWorkflowStatus
      .mutate({
        leadId: lead.id,
        ...input,
      })
      .catch(() => null);
    setUpdatingLeadId(null);
    load();
    onUpdated();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b bg-white px-6 py-4">
        {loading || !detail ? (
          <div className="animate-pulse text-sm text-gray-400">{t("loadingDetail")}</div>
        ) : (
          <div>
            <div className="text-base font-semibold text-gray-900">{displayName(detail)}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{detail.email}</span>
              <EmailStatusBadge
                status={detail.emailStatus}
                suppressedAt={detail.emailSuppressedAt}
              />
            </div>
            {detail.phone && <div className="text-sm text-gray-400">{detail.phone}</div>}
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-gray-400">
              <span>
                {t("sourceLabel")}: <span className="capitalize">{detail.source}</span>
              </span>
              <span>
                {t("firstSeenLabel")}: {formatDate(detail.firstSeenAt)}
              </span>
              <span>
                {t("lastActiveLabel")}: {formatDate(detail.lastSeenAt)}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={onClose}
          className="ml-4 shrink-0 text-xl leading-none text-gray-400 hover:text-gray-700"
          aria-label={t("panelClose")}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      {detail && (
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {detail.leads[0] && (
            <LatestLeadSummary
              lead={detail.leads[0]}
              tasks={tasks}
              updatingLeadId={updatingLeadId}
              onLeadWorkflowStatus={(lead, input) => void handleLeadWorkflowStatus(lead, input)}
            />
          )}

          {/* Lifecycle + Score */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("lifecycleLabel")}
              </h3>
              <span className="text-xs text-gray-400">
                {savingStage ? t("savingStage") : stageSaved ? t("stageSaved") : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={detail.lifecycleStage}
                onChange={(e) => handleStageChange(e.target.value as LifecycleStage)}
                disabled={savingStage}
                className="flex-1 rounded border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
              >
                {LIFECYCLE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {t(`lifecycle_${stage}`)}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <div
                  title={t("scoreLabel")}
                  className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${
                    detail.leadScore >= 70
                      ? "border-green-200 bg-green-50 text-green-700"
                      : detail.leadScore >= 40
                        ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                        : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  {t("scoreLabel")}: {detail.leadScore}
                </div>
                {scoreHistory.length >= 2 && <ScoreSparkline history={scoreHistory} />}
              </div>
            </div>
            {scoreHistory.length > 0 && scoreHistory[0]?.reasoning && (
              <p className="mt-1 text-xs italic text-gray-400">{scoreHistory[0].reasoning}</p>
            )}
          </section>

          {/* Tags */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("tagsLabel")}
            </h3>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {detail.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="leading-none text-blue-400 hover:text-blue-700"
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {detail.tags.length === 0 && <span className="text-xs text-gray-300">—</span>}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                placeholder={t("addTagPlaceholder")}
                className="flex-1 rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleAddTag}
                disabled={!tagInput.trim() || addingTag}
                className="rounded bg-gray-100 px-3 py-1.5 text-xs transition-colors hover:bg-gray-200 disabled:opacity-40"
              >
                {t("addTagBtn")}
              </button>
            </div>
          </section>

          {/* Notes */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("notesLabel")}
              </h3>
              <span className="text-xs text-gray-400">
                {savingNotes ? t("savingNotes") : notesSaved ? t("notesSaved") : ""}
              </span>
            </div>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder={t("notesPlaceholder")}
              className="w-full resize-none rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </section>

          {/* Tasks */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("tasksLabel")}
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-2 rounded border bg-gray-50 p-3">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder={t("taskTitlePlaceholder")}
                className="w-full rounded border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                maxLength={200}
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="datetime-local"
                  value={taskDueAt}
                  onChange={(e) => setTaskDueAt(e.target.value)}
                  className="min-w-0 rounded border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as "low" | "normal" | "high")}
                  className="rounded border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="low">{t("taskPriorityLow")}</option>
                  <option value="normal">{t("taskPriorityNormal")}</option>
                  <option value="high">{t("taskPriorityHigh")}</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!taskTitle.trim() || savingTask}
                className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
              >
                {savingTask ? t("taskSaving") : t("taskCreate")}
              </button>
            </form>
            {tasks.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">{t("tasksEmpty")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {tasks.map((task) => {
                  const done = task.status === "done";
                  return (
                    <div
                      key={`${task.id}:${task.priority}:${formatDateInputValue(task.dueAt)}`}
                      className={`rounded border p-3 text-sm ${done ? "bg-gray-50 text-gray-400" : "bg-white text-gray-800"}`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => void handleToggleTask(task)}
                          className="mt-1 rounded border-gray-300"
                          aria-label={t("taskToggle")}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={done ? "line-through" : ""}>{task.title}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-400">
                            {task.dueAt && <span>{formatDate(task.dueAt)}</span>}
                            <span>{t(`taskPriority_${task.priority}`)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTask(task.id)}
                          className="text-xs text-gray-300 hover:text-red-600"
                          aria-label={t("taskDelete")}
                        >
                          x
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* AI Follow-up */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("followUpDraftLabel")}
            </h3>
            <button
              onClick={handleDraftFollowUp}
              disabled={draftingFollowUp}
              className="w-full rounded bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {draftingFollowUp ? t("draftingFollowUp") : t("aiFollowUp")}
            </button>
            {draft && (
              <div className="relative mt-3 rounded border border-indigo-200 bg-indigo-50 p-3 text-sm text-gray-800">
                <p className="whitespace-pre-wrap pr-16">{draft}</p>
                <button
                  onClick={handleCopyDraft}
                  className="absolute right-2 top-2 rounded border border-indigo-300 px-2 py-0.5 text-xs text-indigo-600 hover:text-indigo-800"
                >
                  {draftCopied ? "✓" : t("copyDraft")}
                </button>
              </div>
            )}
          </section>

          {/* Leads history */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("leadsHistory")}
            </h3>
            {detail.leads.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noLeads")}</p>
            ) : (
              <div className="space-y-3">
                {detail.leads.map((lead) => {
                  const fields = leadImportantFields(lead);
                  return (
                    <div key={lead.id} className="rounded-lg border bg-gray-50 p-3 text-sm">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs text-gray-500">
                            {t("leadFrom", {
                              date: formatDate(lead.submittedAt),
                              source: lead.sourceUrl ?? "landing page",
                            })}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {lead.workflowKind && (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-violet-700">
                                {lead.workflowKind === "booking"
                                  ? "reservation"
                                  : lead.workflowKind}
                              </span>
                            )}
                            {lead.workflowState && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-700">
                                {lead.workflowState.replaceAll("_", " ")}
                              </span>
                            )}
                            {lead.status && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700">
                                {lead.status}
                              </span>
                            )}
                          </div>
                        </div>
                        {lead.workflowKind === "booking" && lead.workflowState !== "confirmed" && (
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                void handleLeadWorkflowStatus(lead, {
                                  status: "contacted",
                                  workflowState: "contacted",
                                })
                              }
                              disabled={updatingLeadId === lead.id}
                              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Mark contacted
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleLeadWorkflowStatus(lead, {
                                  status: "confirmed",
                                  workflowState: "confirmed",
                                })
                              }
                              disabled={updatingLeadId === lead.id}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Confirm reservation
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleLeadWorkflowStatus(lead, {
                                  status: "archived",
                                  workflowState: "declined",
                                })
                              }
                              disabled={updatingLeadId === lead.id}
                              className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="rounded border bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Customer message
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                          {leadMessage(lead)}
                        </p>
                      </div>
                      {fields.length > 0 && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {fields.map((field) => (
                            <div
                              key={`${lead.id}:${field.label}:${field.value}`}
                              className="rounded border border-gray-100 bg-white px-2 py-1.5"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                {field.label}
                              </p>
                              <p className="break-words text-xs font-medium text-gray-700">
                                {field.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600">
                          Technical payload
                        </summary>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border bg-white p-2 text-xs text-gray-600">
                          {JSON.stringify(lead.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Unified CRM timeline */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("timelineTitle")}
            </h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400">{t("timelineEmpty")}</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((item) => {
                  const occurredAt = new Date(item.occurredAt);
                  const pageUrl = typeof item.meta.pageUrl === "string" ? item.meta.pageUrl : null;
                  const amountChf =
                    typeof item.meta.amountChf === "number" && item.meta.amountChf > 0
                      ? item.meta.amountChf
                      : null;
                  const nextRunAt =
                    typeof item.meta.nextRunAt === "string" || item.meta.nextRunAt instanceof Date
                      ? new Date(item.meta.nextRunAt)
                      : null;
                  const taskDueAt =
                    typeof item.meta.dueAt === "string" || item.meta.dueAt instanceof Date
                      ? new Date(item.meta.dueAt)
                      : null;

                  return (
                    <div
                      key={item.id}
                      className="rounded border border-gray-100 bg-white px-3 py-2 text-sm shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold capitalize ${timelineBadgeClass(item.kind)}`}
                            >
                              {timelineKindLabel(item.kind)}
                            </span>
                            <span className="truncate font-medium text-gray-800">{item.title}</span>
                          </div>
                          {item.body && (
                            <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.body}</p>
                          )}
                          {pageUrl && (
                            <p className="mt-1 truncate text-xs text-gray-400" title={pageUrl}>
                              {pageUrl.replace(/^https?:\/\/[^/]+/, "")}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-400">
                            {amountChf !== null && <span>CHF {amountChf}</span>}
                            {nextRunAt && (
                              <span>
                                {t("timelineNext")}: {formatDate(nextRunAt)}
                              </span>
                            )}
                            {taskDueAt && (
                              <span>
                                {t("taskDue")}: {formatDate(taskDueAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        <time className="shrink-0 text-right font-mono text-[11px] text-gray-400">
                          <span className="block">
                            {occurredAt.toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="block">{formatDate(occurredAt)}</span>
                        </time>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ── Sortable column header ─────────────────────────────────────────────────────

type SortBy = "lastSeenAt" | "firstSeenAt" | "email" | "leadScore";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  col,
  sortBy,
  sortDir,
  onToggle,
}: {
  label: string;
  col: SortBy;
  sortBy: SortBy;
  sortDir: SortDir;
  onToggle: (col: SortBy) => void;
}) {
  const active = sortBy === col;
  return (
    <button
      type="button"
      onClick={() => onToggle(col)}
      className={`flex items-center gap-1 uppercase tracking-wide ${
        active ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      <span className={`text-[10px] ${active ? "opacity-100" : "opacity-30"}`}>
        {active && sortDir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function TaskQueuePanel({
  tasks,
  loading,
  onOpenContact,
  onMarkDone,
  onUpdateTask,
  onConfirmReservation,
}: {
  tasks: OpenTaskRow[];
  loading: boolean;
  onOpenContact: (contactId: string) => void;
  onMarkDone: (taskId: string) => void;
  onConfirmReservation: (task: OpenTaskRow) => void;
  onUpdateTask: (
    taskId: string,
    patch: { dueAt?: string | null; priority?: "low" | "normal" | "high" },
  ) => void;
}) {
  const t = useTranslations("CRM");
  const today = startOfLocalDay(new Date());
  const tomorrow = addDays(today, 1);

  const buckets = [
    {
      key: "overdue",
      label: t("tasksOverdue"),
      tone: "border-red-100 bg-red-50/60 text-red-700",
      tasks: tasks.filter((task) => task.dueAt && new Date(task.dueAt) < today),
    },
    {
      key: "today",
      label: t("tasksToday"),
      tone: "border-amber-100 bg-amber-50/70 text-amber-700",
      tasks: tasks.filter((task) => {
        if (!task.dueAt) return false;
        const dueAt = new Date(task.dueAt);
        return dueAt >= today && dueAt < tomorrow;
      }),
    },
    {
      key: "upcoming",
      label: t("tasksUpcoming"),
      tone: "border-blue-100 bg-blue-50/70 text-blue-700",
      tasks: tasks.filter((task) => !task.dueAt || new Date(task.dueAt) >= tomorrow),
    },
  ];

  return (
    <section className="mb-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t("tasksQueueTitle")}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t("tasksQueueSubtitle")}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {t("tasksOpenCount", { count: tasks.length })}
        </span>
      </div>

      {loading ? (
        <div className="animate-pulse rounded border border-gray-100 bg-gray-50 px-3 py-4 text-sm text-gray-400">
          {t("tasksLoading")}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-400">
          {t("tasksQueueEmpty")}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {buckets.map((bucket) => (
            <div key={bucket.key} className="min-w-0 rounded border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${bucket.tone}`}
                >
                  {bucket.label}
                </span>
                <span className="text-xs text-gray-400">{bucket.tasks.length}</span>
              </div>
              {bucket.tasks.length === 0 ? (
                <p className="py-2 text-xs text-gray-400">{t("tasksBucketEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {bucket.tasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="rounded border border-gray-100 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          aria-label={t("taskMarkDone")}
                          onChange={() => onMarkDone(task.id)}
                          className="mt-1 rounded border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => onOpenContact(task.contactId)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate font-medium text-gray-800">{task.title}</div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-400">
                            <span className="truncate">{taskContactName(task)}</span>
                            <span>{task.dueAt ? formatDate(task.dueAt) : t("tasksNoDue")}</span>
                            {task.duplicateCount && task.duplicateCount > 1 && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                                {task.duplicateCount} similar requests
                              </span>
                            )}
                            {task.priority === "high" && (
                              <span className="font-semibold text-red-500">
                                {t("taskPriority_high")}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="flex min-w-0 gap-2">
                          <input
                            type="date"
                            aria-label={t("taskDueDateEdit")}
                            defaultValue={formatDateInputValue(task.dueAt)}
                            onChange={(event) =>
                              onUpdateTask(task.id, {
                                dueAt: dueDateInputToTaskDueAt(event.currentTarget.value),
                              })
                            }
                            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <select
                            aria-label={t("taskPriorityEdit")}
                            value={task.priority}
                            onChange={(event) =>
                              onUpdateTask(task.id, {
                                priority: event.currentTarget.value as "low" | "normal" | "high",
                              })
                            }
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="low">{t("taskPriorityLow")}</option>
                            <option value="normal">{t("taskPriorityNormal")}</option>
                            <option value="high">{t("taskPriorityHigh")}</option>
                          </select>
                        </div>
                        <div className="flex gap-1">
                          {taskCanConfirmReservation(task) && (
                            <button
                              type="button"
                              onClick={() => onConfirmReservation(task)}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Confirm reservation
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onUpdateTask(task.id, { dueAt: buildSnoozeDueAt(1) })}
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                          >
                            {t("taskSnoozeTomorrow")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateTask(task.id, { dueAt: buildSnoozeDueAt(7) })}
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                          >
                            {t("taskSnoozeNextWeek")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CrmPage() {
  const t = useTranslations("CRM");
  const searchParams = useSearchParams();
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [stageFilter, setStageFilter] = useState<LifecycleStage | "">("");
  const [sortBy, setSortBy] = useState<SortBy>("lastSeenAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [data, setData] = useState<ListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openTasks, setOpenTasks] = useState<OpenTaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  useEffect(() => {
    const contactId = searchParams.get("contactId");
    if (contactId) setSelectedId(contactId);
  }, [searchParams]);

  // Debounce search input — wait 250ms after typing stops before querying.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function toggleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      // Default to descending for date/score, ascending for email.
      setSortDir(col === "email" ? "asc" : "desc");
    }
    setPage(1);
  }

  const load = useCallback(() => {
    setIsLoading(true);
    setFetchError(false);
    trpc.contacts.list
      .query({
        tag,
        q: debouncedQ || undefined,
        lifecycleStage: stageFilter || undefined,
        sortBy,
        sortDir,
        page,
        pageSize,
      })
      .then((result) => {
        setData(result as ListResult);
        setIsLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setIsLoading(false);
      });
  }, [tag, debouncedQ, stageFilter, sortBy, sortDir, page, pageSize]);

  const loadOpenTasks = useCallback(() => {
    setTasksLoading(true);
    trpc.contacts.listOpenTasks
      .query({ limit: 30 })
      .then((result) => {
        setOpenTasks(result as OpenTaskRow[]);
        setTasksLoading(false);
      })
      .catch(() => {
        setOpenTasks([]);
        setTasksLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadOpenTasks();
  }, [loadOpenTasks]);

  function refreshCrm() {
    load();
    loadOpenTasks();
  }

  async function handleMarkOpenTaskDone(taskId: string) {
    setOpenTasks((tasks) => tasks.filter((task) => task.id !== taskId));
    await trpc.contacts.updateTaskStatus
      .mutate({ taskId, done: true })
      .catch(() => loadOpenTasks());
  }

  async function handleUpdateOpenTask(
    taskId: string,
    patch: { dueAt?: string | null; priority?: "low" | "normal" | "high" },
  ) {
    setOpenTasks((tasks) =>
      tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              dueAt: patch.dueAt !== undefined ? patch.dueAt : task.dueAt,
              priority: patch.priority ?? task.priority,
            }
          : task,
      ),
    );
    await trpc.contacts.updateTask.mutate({ taskId, ...patch }).catch(() => loadOpenTasks());
  }

  async function handleConfirmReservationTask(task: OpenTaskRow) {
    const leadId = taskLeadId(task);
    if (!leadId) {
      setSelectedId(task.contactId);
      return;
    }
    setOpenTasks((tasks) => tasks.filter((row) => row.id !== task.id));
    await trpc.inbox.updateLeadWorkflowStatus
      .mutate({ leadId, status: "confirmed", workflowState: "confirmed" })
      .catch(() => null);
    refreshCrm();
  }

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;
  const visibleIds = data?.rows.map((r) => r.id) ?? [];
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleChecked) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    if (!confirm(t("bulkDeleteConfirm", { count: ids.length }))) return;
    setBulkBusy(true);
    await trpc.contacts.bulkDelete.mutate({ contactIds: ids }).catch(() => null);
    setSelectedIds(new Set());
    setBulkBusy(false);
    load();
  }

  const [exporting, setExporting] = useState(false);

  async function handleExportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await trpc.contacts.exportCsv.query({
        tag,
        q: debouncedQ || undefined,
        lifecycleStage: stageFilter || undefined,
      });
      const header = [
        "email",
        "first_name",
        "last_name",
        "phone",
        "tags",
        "source",
        "lifecycle_stage",
        "lead_score",
        "first_seen_at",
        "last_seen_at",
        "notes",
      ];
      const esc = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "string" ? v : Array.isArray(v) ? v.join("|") : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.join(",")];
      for (const r of result.rows) {
        lines.push(
          [
            esc(r.email),
            esc(r.firstName),
            esc(r.lastName),
            esc(r.phone),
            esc(r.tags),
            esc(r.source),
            esc(r.lifecycleStage),
            esc(r.leadScore),
            esc(r.firstSeenAt ? new Date(r.firstSeenAt).toISOString() : ""),
            esc(r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : ""),
            esc(r.notes),
          ].join(","),
        );
      }
      // Prefix with UTF-8 BOM so Excel detects the encoding correctly.
      const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Silent — bulk bar handles its own errors; toast layer is a future add.
    } finally {
      setExporting(false);
    }
  }

  async function handleBulkAddTag() {
    const ids = [...selectedIds];
    const tag = bulkTag.trim();
    if (ids.length === 0 || !tag || bulkBusy) return;
    setBulkBusy(true);
    await trpc.contacts.bulkAddTag.mutate({ contactIds: ids, tag }).catch(() => null);
    setBulkTag("");
    setBulkBusy(false);
    load();
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: contact list */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b bg-white px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{t("title")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Use this daily workspace to see who contacted your business, what staff should do
                next, and which conversations or reservations need attention.
              </p>
              {data && (
                <p className="mt-0.5 text-sm text-gray-500">
                  {t("contactCount", { count: data.total })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                placeholder={t("searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-56 rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter((e.target.value as LifecycleStage) || "");
                  setPage(1);
                }}
                className="rounded border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("allStages")}</option>
                {LIFECYCLE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {t(`lifecycle_${stage}`)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t("tagFilter")}
                value={tag ?? ""}
                onChange={(e) => {
                  setTag(e.target.value || undefined);
                  setPage(1);
                }}
                className="w-36 rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleExportCsv}
                disabled={exporting || (data?.total ?? 0) === 0}
                className="whitespace-nowrap rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                title={t("exportCsv")}
              >
                {exporting ? t("exporting") : t("exportCsv")}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="whitespace-nowrap rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
              >
                {t("addContact")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TaskQueuePanel
            tasks={openTasks}
            loading={tasksLoading}
            onOpenContact={setSelectedId}
            onMarkDone={(taskId) => void handleMarkOpenTaskDone(taskId)}
            onUpdateTask={(taskId, patch) => void handleUpdateOpenTask(taskId, patch)}
            onConfirmReservation={(task) => void handleConfirmReservationTask(task)}
          />

          {isLoading && <div className="animate-pulse text-sm text-gray-400">{t("loading")}</div>}

          {fetchError && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {t("error")}
            </div>
          )}

          {selectedId && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-semibold">Customer details are open on the right.</p>
              <p className="mt-1 text-blue-700">
                Review the latest lead, reservation task, notes, and timeline before replying or
                marking the follow-up complete.
              </p>
            </div>
          )}

          {!isLoading && data && data.rows.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">
              {tag ? t("emptyWithTag", { tag }) : t("empty")}
            </div>
          )}

          {data && data.rows.length > 0 && (
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={t("selectAll")}
                        checked={allVisibleChecked}
                        onChange={toggleAllVisible}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortHeader
                        label={t("colName")}
                        col="email"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">{t("colTags")}</th>
                    <th className="hidden px-4 py-3 text-left md:table-cell">{t("colSource")}</th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">
                      <SortHeader
                        label={t("colFirstSeen")}
                        col="firstSeenAt"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      />
                    </th>
                    <th className="hidden px-4 py-3 text-left lg:table-cell">
                      <SortHeader
                        label={t("colLastActive")}
                        col="lastSeenAt"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      />
                    </th>
                    <th className="px-4 py-3 text-right">{t("colLeads")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((contact) => (
                    <tr
                      key={contact.id}
                      onClick={() => setSelectedId(contact.id === selectedId ? null : contact.id)}
                      className={`cursor-pointer border-b transition-colors last:border-0 ${
                        contact.id === selectedId ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={t("selectRow")}
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleOne(contact.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {(contact.firstName || contact.lastName) && (
                          <div className="font-medium text-gray-900">
                            {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                          </div>
                        )}
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-gray-500">{contact.email}</span>
                          <EmailStatusBadge
                            status={contact.emailStatus}
                            suppressedAt={contact.emailSuppressedAt}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.map((tagName) => (
                            <span
                              key={tagName}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTag(tagName);
                                setPage(1);
                              }}
                              className="cursor-pointer rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                            >
                              {tagName}
                            </span>
                          ))}
                          {contact.tags.length === 0 && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 capitalize text-gray-500 md:table-cell">
                        {contact.source}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
                        {formatDate(contact.firstSeenAt)}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
                        {formatDate(contact.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {contact.leadCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
              >
                {t("prevPage")}
              </button>
              <span className="text-gray-500">{t("pageInfo", { page, total: totalPages })}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
              >
                {t("nextPage")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selectedId && (
        <div className="flex w-full shrink-0 flex-col overflow-hidden border-l bg-white shadow-lg lg:w-[560px] xl:w-[680px]">
          <DetailPanel
            key={selectedId}
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={refreshCrm}
          />
        </div>
      )}

      {/* Add contact modal */}
      {showAddModal && (
        <AddContactModal onClose={() => setShowAddModal(false)} onCreated={refreshCrm} />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex max-w-3xl -translate-x-1/2 items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white shadow-2xl">
          <span className="whitespace-nowrap text-sm font-medium">
            {t("bulkSelectedCount", { count: selectedIds.size })}
          </span>
          <div className="h-5 w-px bg-gray-700" />
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder={t("bulkAddTagPlaceholder")}
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBulkAddTag()}
              disabled={bulkBusy}
              className="w-36 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleBulkAddTag}
              disabled={!bulkTag.trim() || bulkBusy}
              className="whitespace-nowrap rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700 disabled:opacity-40"
            >
              {t("bulkAddTag")}
            </button>
          </div>
          <div className="h-5 w-px bg-gray-700" />
          <button
            onClick={handleBulkDelete}
            disabled={bulkBusy}
            className="whitespace-nowrap rounded bg-red-600 px-3 py-1 text-sm hover:bg-red-700 disabled:opacity-40"
          >
            {t("bulkDelete")}
          </button>
          <div className="h-5 w-px bg-gray-700" />
          <button
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
            className="text-sm text-gray-300 hover:text-white"
          >
            {t("bulkClear")}
          </button>
        </div>
      )}
    </div>
  );
}
