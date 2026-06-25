"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type DealStage = {
  id: string;
  label: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
};

type DealRow = {
  id: string;
  title: string;
  amountChf: number;
  expectedCloseDate: string | null;
  aiSummary: string | null;
  status: "open" | "won" | "lost";
  stageId: string;
  wonAt: Date | string | null;
  lostReason: string | null;
  createdAt: Date | string;
  contactId: string | null;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
};

type ForecastStage = {
  stageId: string;
  stageLabel: string;
  isWon: boolean;
  dealCount: number;
  totalChf: number;
};

type Forecast = {
  pipeline: ForecastStage[];
  winRate: number | null;
  avgDaysToClose: number | null;
  totalOpenChf: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatChf(amount: number) {
  return `CHF ${amount.toLocaleString("de-CH")}`;
}

function contactName(deal: DealRow) {
  const parts = [deal.contactFirstName, deal.contactLastName].filter(Boolean).join(" ");
  return parts || deal.contactEmail || null;
}

// Map seeded English stage labels to localized text. Custom user-defined
// stages fall through to the original label.
function useStageLabel() {
  const t = useTranslations("Deals");
  return (rawLabel: string): string => {
    const key = rawLabel.trim().toLowerCase();
    const map: Record<
      string,
      "stage_inquiry" | "stage_qualified" | "stage_proposal" | "stage_won" | "stage_lost"
    > = {
      inquiry: "stage_inquiry",
      qualified: "stage_qualified",
      proposal: "stage_proposal",
      won: "stage_won",
      lost: "stage_lost",
    };
    const tk = map[key];
    return tk ? t(tk) : rawLabel;
  };
}

// ─── New Deal Modal ───────────────────────────────────────────────────────────

function NewDealModal({
  stages,
  onClose,
  onCreated,
}: {
  stages: DealStage[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Deals");
  const stageLabel = useStageLabel();
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);

  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState(openStages[0]?.id ?? "");
  const [amountChf, setAmountChf] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !stageId) return;
    setCreating(true);
    setError(null);
    try {
      await trpc.deals.create.mutate({
        title: title.trim(),
        stageId,
        amountChf: amountChf ? parseInt(amountChf, 10) : 0,
        expectedCloseDate: expectedCloseDate || undefined,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? t("createError"));
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">{t("newDealTitle")}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("dealTitle")}</label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("dealTitlePlaceholder")}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t("stageLabel")}
            </label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full rounded border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {openStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {stageLabel(s.label)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("amountChf")}
              </label>
              <input
                type="number"
                min="0"
                value={amountChf}
                onChange={(e) => setAmountChf(e.target.value)}
                placeholder="0"
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("closeDate")}
              </label>
              <input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
              className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim() || !stageId}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? t("creating") : t("createDeal")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mark Lost Modal ──────────────────────────────────────────────────────────

function MarkLostModal({
  dealId,
  dealTitle,
  onClose,
  onDone,
}: {
  dealId: string;
  dealTitle: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Deals");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await trpc.deals.markLost
      .mutate({ dealId, reason: reason.trim() || undefined })
      .catch(() => null);
    setSaving(false);
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold">{t("markLostTitle")}</h2>
        <p className="text-sm text-gray-500">{dealTitle}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {t("lostReason")}
            </label>
            <input
              type="text"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("lostReasonPlaceholder")}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? t("saving") : t("confirmLost")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

function DealCard({
  deal,
  onDragStart,
  onWon,
  onLost,
}: {
  deal: DealRow;
  onDragStart: (dealId: string) => void;
  onWon: (deal: DealRow) => void;
  onLost: (deal: DealRow) => void;
}) {
  const t = useTranslations("Deals");
  const name = contactName(deal);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal.id)}
      className="cursor-grab select-none rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <p className="mb-1 text-sm font-medium leading-snug text-gray-900">{deal.title}</p>
      {name && <p className="mb-1 text-xs text-gray-500">{name}</p>}
      {deal.amountChf > 0 && (
        <p className="mb-1 text-xs font-semibold text-green-700">{formatChf(deal.amountChf)}</p>
      )}
      {deal.expectedCloseDate && (
        <p className="mb-1 text-xs text-gray-400">
          {t("closeBy")} {deal.expectedCloseDate}
        </p>
      )}
      {deal.aiSummary && (
        <p className="mt-1.5 rounded bg-indigo-50 px-2 py-1 text-xs leading-snug text-indigo-600">
          {deal.aiSummary}
        </p>
      )}
      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => onWon(deal)}
          className="flex-1 rounded border border-green-200 bg-green-50 py-1 text-xs text-green-700 transition-colors hover:bg-green-100"
        >
          {t("won")}
        </button>
        <button
          onClick={() => onLost(deal)}
          className="flex-1 rounded border border-red-200 bg-red-50 py-1 text-xs text-red-700 transition-colors hover:bg-red-100"
        >
          {t("lost")}
        </button>
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  deals: columnDeals,
  draggingId,
  onDragStart,
  onDrop,
  onWon,
  onLost,
}: {
  stage: DealStage;
  deals: DealRow[];
  draggingId: string | null;
  onDragStart: (dealId: string) => void;
  onDrop: (stageId: string) => void;
  onWon: (deal: DealRow) => void;
  onLost: (deal: DealRow) => void;
}) {
  const t = useTranslations("Deals");
  const stageLabel = useStageLabel();
  const [dragOver, setDragOver] = useState(false);
  const totalChf = columnDeals.reduce((sum, d) => sum + d.amountChf, 0);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    onDrop(stage.id);
  }

  const colStyle = stage.isWon
    ? "border-green-300 bg-green-50"
    : stage.isLost
      ? "border-red-300 bg-red-50"
      : "border-gray-200 bg-gray-50";

  return (
    <div
      className={`flex min-h-[400px] w-64 shrink-0 flex-col rounded-xl border-2 transition-colors ${colStyle} ${dragOver ? "ring-2 ring-blue-400" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="border-b border-gray-200 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            {stageLabel(stage.label)}
          </span>
          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500">
            {columnDeals.length}
          </span>
        </div>
        {totalChf > 0 && <p className="mt-0.5 text-xs text-gray-500">{formatChf(totalChf)}</p>}
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {columnDeals.length === 0 && (
          <p className="pt-8 text-center text-xs text-gray-300">{t("emptyColumn")}</p>
        )}
        {columnDeals
          .filter((d) => d.id !== draggingId)
          .map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onDragStart={onDragStart}
              onWon={onWon}
              onLost={onLost}
            />
          ))}
      </div>
    </div>
  );
}

// ─── Forecast Table ───────────────────────────────────────────────────────────

function ForecastTable({ forecast }: { forecast: Forecast }) {
  const t = useTranslations("Deals");
  const stageLabel = useStageLabel();
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">{t("forecastTitle")}</h2>
        <div className="mt-1 flex gap-6 text-xs text-gray-500">
          <span>
            {t("totalOpen")}:{" "}
            <span className="font-semibold text-gray-800">{formatChf(forecast.totalOpenChf)}</span>
          </span>
          {forecast.winRate !== null && (
            <span>
              {t("winRate")}:{" "}
              <span className="font-semibold text-gray-800">{forecast.winRate}%</span>
            </span>
          )}
          {forecast.avgDaysToClose !== null && (
            <span>
              {t("avgClose")}:{" "}
              <span className="font-semibold text-gray-800">
                {forecast.avgDaysToClose} {t("days")}
              </span>
            </span>
          )}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 text-left">{t("colStage")}</th>
            <th className="px-4 py-2 text-right">{t("colDeals")}</th>
            <th className="px-4 py-2 text-right">{t("colValue")}</th>
          </tr>
        </thead>
        <tbody>
          {forecast.pipeline.map((row) => (
            <tr key={row.stageId} className="border-b last:border-0">
              <td className="flex items-center gap-1.5 px-4 py-2.5 text-gray-700">
                {row.isWon && <span className="text-green-500">✓</span>}
                {stageLabel(row.stageLabel)}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-600">{row.dealCount}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                {formatChf(row.totalChf)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const t = useTranslations("Deals");

  const [stages, setStages] = useState<DealStage[]>([]);
  const [dealsList, setDealsList] = useState<DealRow[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showNewDeal, setShowNewDeal] = useState(false);
  const [markLostDeal, setMarkLostDeal] = useState<DealRow | null>(null);

  const draggingId = useRef<string | null>(null);
  const [draggingState, setDraggingState] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [stagesRes, dealsRes, forecastRes] = await Promise.all([
        trpc.deals.listStages.query(),
        trpc.deals.listByPipeline.query(),
        trpc.deals.getForecast.query(),
      ]);
      setStages(stagesRes as DealStage[]);
      setDealsList(dealsRes as DealRow[]);
      setForecast(forecastRes as Forecast);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleDragStart(dealId: string) {
    draggingId.current = dealId;
    setDraggingState(dealId);
  }

  async function handleDrop(targetStageId: string) {
    const dealId = draggingId.current;
    draggingId.current = null;
    setDraggingState(null);
    if (!dealId) return;

    const deal = dealsList.find((d) => d.id === dealId);
    if (!deal || deal.stageId === targetStageId) return;

    // Optimistic update.
    setDealsList((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId: targetStageId } : d)),
    );

    await trpc.deals.moveStage.mutate({ dealId, stageId: targetStageId }).catch(() => {
      load(); // revert on failure
    });
  }

  async function handleWon(deal: DealRow) {
    await trpc.deals.markWon.mutate({ dealId: deal.id }).catch(() => null);
    load();
  }

  function handleLostRequest(deal: DealRow) {
    setMarkLostDeal(deal);
  }

  const openStages = stages.filter((s) => !s.isWon && !s.isLost);
  const wonStages = stages.filter((s) => s.isWon);
  const lostStages = stages.filter((s) => s.isLost);
  const kanbanStages = [...openStages, ...wonStages, ...lostStages];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{t("subtitle")}</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
            Deals are useful for larger opportunities such as private dining, catering, events, or
            high-value bookings. Move each card across the columns as the sale progresses.
          </p>
        </div>
        <button
          onClick={() => setShowNewDeal(true)}
          className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
        >
          {t("newDeal")}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {t("loadError")}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-1 animate-pulse items-center justify-center text-sm text-gray-400">
          {t("loading")}
        </div>
      )}

      {!loading && !error && (
        <div className="flex-1 overflow-y-auto">
          {/* Kanban board */}
          <div className="p-6">
            <div
              className="flex gap-4 overflow-x-auto pb-4"
              onDragEnd={() => {
                draggingId.current = null;
                setDraggingState(null);
              }}
            >
              {kanbanStages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={dealsList.filter((d) => d.stageId === stage.id)}
                  draggingId={draggingState}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  onWon={handleWon}
                  onLost={handleLostRequest}
                />
              ))}
            </div>
          </div>

          {/* Forecast table */}
          {forecast && (
            <div className="max-w-2xl px-6 pb-8">
              <ForecastTable forecast={forecast} />
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showNewDeal && (
        <NewDealModal stages={stages} onClose={() => setShowNewDeal(false)} onCreated={load} />
      )}
      {markLostDeal && (
        <MarkLostModal
          dealId={markLostDeal.id}
          dealTitle={markLostDeal.title}
          onClose={() => setMarkLostDeal(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
