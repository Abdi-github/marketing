"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type SegmentField = "lifecycle_stage" | "lead_score" | "tags" | "source" | "email";
type SegmentOp = "eq" | "neq" | "gte" | "lte" | "contains" | "not_contains";

type LeafRule = { field: SegmentField; op: SegmentOp; value: string };
type GroupRule = { op: "and" | "or"; children: LeafRule[] };

type SegmentRow = {
  id: string;
  name: string;
  ruleJson: GroupRule;
  contactCount: number;
  createdAt: string | Date;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELDS: { value: SegmentField; label: string }[] = [
  { value: "lifecycle_stage", label: "Lifecycle stage" },
  { value: "lead_score", label: "Lead score" },
  { value: "tags", label: "Tags" },
  { value: "source", label: "Source" },
  { value: "email", label: "Email" },
];

const OPS_BY_FIELD: Record<SegmentField, { value: SegmentOp; label: string }[]> = {
  lifecycle_stage: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
  ],
  lead_score: [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "eq", label: "=" },
  ],
  tags: [
    { value: "contains", label: "has tag" },
    { value: "not_contains", label: "missing tag" },
  ],
  source: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "contains", label: "contains" },
  ],
  email: [{ value: "contains", label: "contains" }],
};

const LIFECYCLE_VALUES = ["subscriber", "lead", "mql", "sql", "customer", "evangelist"];
const SOURCE_VALUES = ["form", "landing_page", "manual", "api"];

function defaultValueForField(field: SegmentField): string {
  if (field === "lifecycle_stage") return "lead";
  if (field === "lead_score") return "50";
  if (field === "source") return "form";
  return "";
}

function defaultOpForField(field: SegmentField): SegmentOp {
  return OPS_BY_FIELD[field][0]!.value;
}

function emptyRule(): GroupRule {
  return { op: "and", children: [] };
}

// ─── ValueInput ───────────────────────────────────────────────────────────────

function ValueInput({
  field,
  value,
  onChange,
}: {
  field: SegmentField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field === "lifecycle_stage") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {LIFECYCLE_VALUES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  if (field === "source") {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          list="source-options"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <datalist id="source-options">
          {SOURCE_VALUES.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
    );
  }
  if (field === "lead_score") {
    return (
      <input
        type="number"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className="w-36 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

// ─── Rule Builder ─────────────────────────────────────────────────────────────

function RuleBuilder({
  rule,
  onChange,
  previewCount,
}: {
  rule: GroupRule;
  onChange: (r: GroupRule) => void;
  previewCount: number | null;
}) {
  const t = useTranslations("Segments");

  function updateOp(op: "and" | "or") {
    onChange({ ...rule, op });
  }

  function addLeaf() {
    const field: SegmentField = "lifecycle_stage";
    onChange({
      ...rule,
      children: [
        ...rule.children,
        { field, op: defaultOpForField(field), value: defaultValueForField(field) },
      ],
    });
  }

  function updateLeaf(index: number, patch: Partial<LeafRule>) {
    const updated = rule.children.map((leaf, i) => {
      if (i !== index) return leaf;
      const newLeaf = { ...leaf, ...patch };
      // Reset op and value when field changes.
      if (patch.field && patch.field !== leaf.field) {
        newLeaf.op = defaultOpForField(patch.field);
        newLeaf.value = defaultValueForField(patch.field);
      }
      return newLeaf;
    });
    onChange({ ...rule, children: updated });
  }

  function removeLeaf(index: number) {
    onChange({ ...rule, children: rule.children.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3">
      {/* Match operator toggle */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">{t("match")}</span>
        <button
          type="button"
          onClick={() => updateOp("and")}
          className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
            rule.op === "and"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t("matchAll")}
        </button>
        <button
          type="button"
          onClick={() => updateOp("or")}
          className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
            rule.op === "or"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t("matchAny")}
        </button>
        <span className="text-xs text-gray-400">{t("ofTheFollowing")}</span>
      </div>

      {/* Leaf rules */}
      {rule.children.length === 0 && (
        <p className="text-sm italic text-gray-400">{t("noConditions")}</p>
      )}
      {rule.children.map((leaf, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {/* Field selector */}
          <select
            value={leaf.field}
            onChange={(e) => updateLeaf(i, { field: e.target.value as SegmentField })}
            className="rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Op selector */}
          <select
            value={leaf.op}
            onChange={(e) => updateLeaf(i, { op: e.target.value as SegmentOp })}
            className="rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {(OPS_BY_FIELD[leaf.field] ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Value input */}
          <ValueInput
            field={leaf.field}
            value={leaf.value}
            onChange={(v) => updateLeaf(i, { value: v })}
          />

          <button
            type="button"
            onClick={() => removeLeaf(i)}
            className="text-lg leading-none text-gray-400 hover:text-red-500"
            aria-label="Remove condition"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addLeaf}
        className="rounded border border-dashed border-blue-300 px-3 py-1.5 text-sm text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
      >
        + {t("addCondition")}
      </button>

      {/* Live count preview */}
      {previewCount !== null && (
        <p className="text-sm text-gray-600">{t("matchesCount", { count: previewCount })}</p>
      )}
    </div>
  );
}

// ─── Bulk Action Panel ────────────────────────────────────────────────────────

function BulkActionPanel({ segment, onDone }: { segment: SegmentRow; onDone: () => void }) {
  const t = useTranslations("Segments");
  const [tag, setTag] = useState("");
  const [lifecycle, setLifecycle] = useState<string>("lead");
  const [sequenceId, setSequenceId] = useState("");
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    trpc.sequences.listSequences
      .query()
      .then((r) =>
        setSequences(
          r.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name })),
        ),
      )
      .catch(() => null);
  }, []);

  async function run(action: () => Promise<{ updated?: number; enrolled?: number }>) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await action();
      const n = result.updated ?? result.enrolled ?? 0;
      setMsg(t("bulkDone", { count: n }));
      onDone();
    } catch (err: unknown) {
      setMsg((err as { message?: string })?.message ?? t("bulkError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setMsg(null);
    try {
      const { csv, count } = await trpc.segments.bulkExportCsv.query({ segmentId: segment.id });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${segment.name.replace(/\s+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(t("exportDone", { count }));
    } catch {
      setMsg(t("bulkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <h3 className="font-semibold text-gray-800">{t("bulkActionsTitle")}</h3>

      {/* Add tag */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 shrink-0 text-gray-600">{t("addTag")}</span>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder={t("tagPlaceholder")}
          className="w-36 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => run(() => trpc.segments.bulkAddTag.mutate({ segmentId: segment.id, tag }))}
          disabled={busy || !tag.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t("apply")}
        </button>
      </div>

      {/* Change lifecycle */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 shrink-0 text-gray-600">{t("changeLifecycle")}</span>
        <select
          value={lifecycle}
          onChange={(e) => setLifecycle(e.target.value)}
          className="rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {LIFECYCLE_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            run(() =>
              trpc.segments.bulkChangeLifecycle.mutate({
                segmentId: segment.id,
                lifecycleStage: lifecycle as
                  | "subscriber"
                  | "lead"
                  | "mql"
                  | "sql"
                  | "customer"
                  | "evangelist",
              }),
            )
          }
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t("apply")}
        </button>
      </div>

      {/* Enroll in sequence */}
      {sequences.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 shrink-0 text-gray-600">{t("enrollSequence")}</span>
          <select
            value={sequenceId}
            onChange={(e) => setSequenceId(e.target.value)}
            className="rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t("selectSequence")}</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              run(() =>
                trpc.segments.bulkEnrollSequence.mutate({
                  segmentId: segment.id,
                  sequenceId,
                }),
              )
            }
            disabled={busy || !sequenceId}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t("apply")}
          </button>
        </div>
      )}

      {/* Export CSV */}
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-gray-600">{t("exportCsv")}</span>
        <button
          onClick={handleExport}
          disabled={busy}
          className="rounded border bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 disabled:opacity-50"
        >
          {t("downloadCsv")}
        </button>
      </div>

      {msg && (
        <p
          className={`rounded p-2 text-xs ${msg.includes("Error") || msg.includes("error") ? "border border-red-200 bg-red-50 text-red-700" : "border border-green-200 bg-green-50 text-green-700"}`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}

// ─── Segment Editor (create / edit) ──────────────────────────────────────────

function SegmentEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: SegmentRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Segments");
  const [name, setName] = useState(initial?.name ?? "");
  const [rule, setRule] = useState<GroupRule>(initial?.ruleJson ?? emptyRule());
  const [nlPrompt, setNlPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced live count preview.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      trpc.segments.previewCount
        .query({ ruleJson: rule })
        .then((r) => setPreviewCount(r.count))
        .catch(() => null);
    }, 600);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [rule]);

  async function handleNlGenerate() {
    if (!nlPrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await trpc.segments.fromNaturalLanguage.mutate({ prompt: nlPrompt.trim() });
      setRule(result.ruleJson as GroupRule);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? t("nlError"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await trpc.segments.update.mutate({
          segmentId: initial.id,
          name: name.trim(),
          ruleJson: rule,
        });
      } else {
        await trpc.segments.create.mutate({ name: name.trim(), ruleJson: rule });
      }
      onSaved();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? t("saveError"));
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5 rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">
        {initial ? t("editSegment") : t("newSegment")}
      </h2>

      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t("segmentName")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder={t("segmentNamePlaceholder")}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* NL input */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{t("nlLabel")}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNlGenerate()}
            placeholder={t("nlPlaceholder")}
            className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleNlGenerate}
            disabled={generating || !nlPrompt.trim()}
            className="whitespace-nowrap rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? t("generating") : t("generateRule")}
          </button>
        </div>
      </div>

      {/* Rule builder */}
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">{t("ruleBuilder")}</label>
        <div className="rounded-lg border bg-gray-50 p-4">
          <RuleBuilder rule={rule} onChange={setRule} previewCount={previewCount} />
        </div>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type View = "list" | "create" | { edit: SegmentRow } | { actions: SegmentRow };

export default function SegmentsPage() {
  const t = useTranslations("Segments");
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>("list");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await trpc.segments.list.query();
      setRows(data as SegmentRow[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeleting(id);
    await trpc.segments.delete.mutate({ segmentId: id }).catch(() => null);
    setDeleting(null);
    load();
  }

  if (view === "create") {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <SegmentEditor
          onSaved={() => {
            setView("list");
            load();
          }}
          onCancel={() => setView("list")}
        />
      </div>
    );
  }

  if (typeof view === "object" && "edit" in view) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <SegmentEditor
          initial={view.edit}
          onSaved={() => {
            setView("list");
            load();
          }}
          onCancel={() => setView("list")}
        />
      </div>
    );
  }

  if (typeof view === "object" && "actions" in view) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-6 py-8">
        <button
          onClick={() => setView("list")}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          ← {t("backToList")}
        </button>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">{view.actions.name}</h2>
            <p className="text-sm text-gray-500">
              {t("matchesCount", { count: view.actions.contactCount })}
            </p>
          </div>
          <BulkActionPanel segment={view.actions} onDone={load} />
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setView("create")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
        >
          {t("newSegment")}
        </button>
      </div>

      {loading && <p className="animate-pulse text-sm text-gray-400">{t("loading")}</p>}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {t("loadError")}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="py-16 text-center text-gray-400">
          <p className="text-sm">{t("empty")}</p>
          <p className="mt-1 text-xs">{t("emptyHint")}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 text-left">{t("colName")}</th>
                <th className="px-4 py-3 text-left">{t("colConditions")}</th>
                <th className="px-4 py-3 text-right">{t("colContacts")}</th>
                <th className="px-4 py-3 text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((seg) => {
                const ruleStr =
                  seg.ruleJson.children.length > 0
                    ? seg.ruleJson.children
                        .map((l) => `${l.field} ${l.op} "${l.value}"`)
                        .join(seg.ruleJson.op === "and" ? " AND " : " OR ")
                    : t("noConditions");
                return (
                  <tr key={seg.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{seg.name}</td>
                    <td
                      className="max-w-xs truncate px-4 py-3 font-mono text-xs text-gray-500"
                      title={ruleStr}
                    >
                      {ruleStr}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {seg.contactCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setView({ actions: seg })}
                          className="rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                        >
                          {t("actions")}
                        </button>
                        <button
                          onClick={() => setView({ edit: seg })}
                          className="rounded border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          {t("edit")}
                        </button>
                        <button
                          onClick={() => handleDelete(seg.id)}
                          disabled={deleting === seg.id}
                          className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
