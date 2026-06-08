"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../../../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type Variant = {
  id: string;
  versionId: string;
  label: string;
  trafficPct: number;
  versionNumber: number;
  views: number;
  conversions: number;
  conversionRate: number;
};

type Experiment = {
  id: string;
  name: string;
  status: "running" | "stopped" | "complete";
  startedAt: string | Date;
  endedAt: string | Date | null;
  winnerVersionId: string | null;
  variants: Variant[];
};

type JudgmentResult = {
  judgment: {
    winner: "a" | "b" | "inconclusive";
    confidence: number;
    reasoning: string;
    ready: boolean;
  };
  variantA: { id: string; label: string; versionId: string; views: number; conversions: number };
  variantB: { id: string; label: string; versionId: string; views: number; conversions: number };
};

// ─── Stat bar ─────────────────────────────────────────────────────────────────

function StatBar({ label, value, pct, isWinner }: { label: string; value: string; pct: number; isWinner?: boolean }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
          {label}
          {isWinner && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Winner</span>
          )}
        </span>
        <span className="text-sm text-gray-600">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all ${isWinner ? "bg-green-500" : "bg-blue-400"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ─── New experiment form ──────────────────────────────────────────────────────

function NewExperimentPanel({
  pageId,
  onCreated,
}: {
  pageId: string;
  onCreated: () => void;
}) {
  const t = useTranslations("Experiments");
  const [name, setName] = useState("");
  const [variantA, setVariantA] = useState({ versionId: "", label: "Variant A", trafficPct: 50 });
  const [variantB, setVariantB] = useState({ versionId: "", label: "Variant B", trafficPct: 50 });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim() || !variantA.versionId || !variantB.versionId) return;
    setCreating(true);
    setError(null);
    try {
      await trpc.experiments.create.mutate({
        pageId,
        name: name.trim(),
        variants: [
          { versionId: variantA.versionId, label: variantA.label, trafficPct: variantA.trafficPct },
          { versionId: variantB.versionId, label: variantB.label, trafficPct: variantB.trafficPct },
        ],
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 mt-6">
      <h3 className="text-sm font-semibold text-blue-800 mb-4">{t("newExperiment")}</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t("experimentName")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("experimentNamePlaceholder")}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {[
          { variant: variantA, setVariant: setVariantA, prefix: "A" },
          { variant: variantB, setVariant: setVariantB, prefix: "B" },
        ].map(({ variant, setVariant, prefix }) => (
          <div key={prefix} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("versionId")} ({prefix})</label>
              <input
                value={variant.versionId}
                onChange={(e) => setVariant((v) => ({ ...v, versionId: e.target.value }))}
                placeholder="UUID of version..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("label")}</label>
              <input
                value={variant.label}
                onChange={(e) => setVariant((v) => ({ ...v, label: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("traffic")} %</label>
              <input
                type="number"
                min={1}
                max={99}
                value={variant.trafficPct}
                onChange={(e) => setVariant((v) => ({ ...v, trafficPct: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        onClick={handleCreate}
        disabled={creating || !name.trim() || !variantA.versionId || !variantB.versionId}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {creating ? t("creating") : t("startExperiment")}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const params = useParams();
  const pageId = params.id as string;
  const t = useTranslations("Experiments");

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [judgment, setJudgment] = useState<JudgmentResult | null>(null);
  const [judging, setJudging] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function loadExperiment() {
    setLoading(true);
    try {
      const data = await trpc.experiments.getByPage.query({ pageId });
      setExperiment(data as Experiment | null);
    } catch {
      setExperiment(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadExperiment();
  }, [pageId]);

  async function handleJudge() {
    if (!experiment) return;
    setJudging(true);
    setJudgment(null);
    try {
      const result = await trpc.experiments.judgeWinner.mutate({ experimentId: experiment.id });
      setJudgment(result as JudgmentResult);
    } finally {
      setJudging(false);
    }
  }

  async function handlePromote(winnerVersionId: string) {
    if (!experiment) return;
    setPromoting(winnerVersionId);
    try {
      await trpc.experiments.promoteWinner.mutate({ experimentId: experiment.id, winnerVersionId });
      await loadExperiment();
      setJudgment(null);
    } finally {
      setPromoting(null);
    }
  }

  async function handleStop() {
    if (!experiment) return;
    setStopping(true);
    try {
      await trpc.experiments.stop.mutate({ experimentId: experiment.id });
      await loadExperiment();
    } finally {
      setStopping(false);
    }
  }

  const isRunning = experiment?.status === "running";
  const maxConvRate = experiment?.variants.reduce((m, v) => Math.max(m, v.conversionRate), 0) ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{t("loading")}</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        {!isRunning && (
          <button
            onClick={() => setShowNew((s) => !s)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("newExperiment")}
          </button>
        )}
      </div>

      {showNew && (
        <NewExperimentPanel
          pageId={pageId}
          onCreated={async () => {
            setShowNew(false);
            await loadExperiment();
          }}
        />
      )}

      {!experiment && !showNew && (
        <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <p className="text-sm">{t("noExperiment")}</p>
          <p className="mt-1 text-xs opacity-70">{t("noExperimentHint")}</p>
        </div>
      )}

      {experiment && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{experiment.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t("started")} {new Date(experiment.startedAt).toLocaleDateString()}
                {experiment.endedAt && ` · ${t("ended")} ${new Date(experiment.endedAt).toLocaleDateString()}`}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                experiment.status === "running"
                  ? "bg-green-100 text-green-700"
                  : experiment.status === "complete"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {t(`status_${experiment.status}`)}
            </span>
          </div>

          {/* Variant stats */}
          <div className="space-y-4 mb-6">
            {experiment.variants.map((v) => {
              const isWinner = experiment.winnerVersionId === v.versionId;
              return (
                <div key={v.id} className="rounded-lg bg-gray-50 p-4">
                  <StatBar
                    label={`${v.label} (v${v.versionNumber})`}
                    value={`${v.conversionRate.toFixed(1)}% (${v.conversions}/${v.views})`}
                    pct={maxConvRate > 0 ? (v.conversionRate / maxConvRate) * 100 : 0}
                    isWinner={isWinner}
                  />
                  <p className="text-xs text-gray-500">{t("traffic")}: {v.trafficPct}%</p>
                </div>
              );
            })}
          </div>

          {/* Judgment result */}
          {judgment && (
            <div
              className={`rounded-lg border p-4 mb-4 ${
                judgment.judgment.ready
                  ? "border-green-200 bg-green-50"
                  : "border-yellow-200 bg-yellow-50"
              }`}
            >
              <p className="text-sm font-medium text-gray-800">
                {judgment.judgment.ready
                  ? judgment.judgment.winner !== "inconclusive"
                    ? `✓ ${t("winnerIs")} ${judgment.judgment.winner === "a" ? judgment.variantA.label : judgment.variantB.label} (${(judgment.judgment.confidence * 100).toFixed(0)}% ${t("confidence")})`
                    : t("inconclusive")
                  : t("notReady")}
              </p>
              <p className="text-xs text-gray-600 mt-1">{judgment.judgment.reasoning}</p>
              {judgment.judgment.ready && judgment.judgment.winner !== "inconclusive" && isRunning && (
                <button
                  onClick={() =>
                    handlePromote(
                      judgment.judgment.winner === "a"
                        ? judgment.variantA.versionId
                        : judgment.variantB.versionId,
                    )
                  }
                  disabled={!!promoting}
                  className="mt-3 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {promoting ? t("promoting") : t("promoteWinner")}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          {isRunning && (
            <div className="flex gap-3">
              <button
                onClick={handleJudge}
                disabled={judging}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40"
              >
                {judging ? t("judging") : t("judgeWinner")}
              </button>
              <button
                onClick={handleStop}
                disabled={stopping}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                {stopping ? t("stopping") : t("stopExperiment")}
              </button>
            </div>
          )}

          {experiment.status === "complete" && (
            <p className="text-sm text-blue-600 font-medium">
              ✓ {t("completed")} — {t("winnerPromoted")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
