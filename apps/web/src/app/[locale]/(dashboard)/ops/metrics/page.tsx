"use client";

import React, { useState, useEffect, useCallback } from "react";
import { trpc } from "../../../../../lib/trpc";

// ─── Types (mirroring the tRPC output shape) ─────────────────────────────────

type ActivityDay = {
  date: string;
  postsGenerated: number;
  leadsCaptured: number;
};

type DesignPartner = {
  tenantId: string;
  name: string;
  slug: string;
  vertical: string;
  plan: string;
  trialStartAt: string;
  firstPostAt: string | null;
  firstPaidAt: string | null;
  churnedAt: string | null;
  activityDays: ActivityDay[];
};

type RetentionByVertical = Record<string, { d7: number; d30: number; d60: number }>;

type MetricsData = {
  designPartners: DesignPartner[];
  conversionRate: number;
  convertedCount: number;
  eligibleCount: number;
  retentionByVertical: RetentionByVertical;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function fmtDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("de-CH");
}

function planBadgeClass(plan: string): string {
  if (plan === "growth") return "bg-purple-100 text-purple-700";
  if (plan === "starter") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function verticalLabel(v: string): string {
  if (v === "restaurant") return "Restaurant";
  if (v === "cafe") return "Café";
  if (v === "fitness_studio") return "Fitness";
  return v;
}

function retentionColor(pct: number): string {
  if (pct >= 70) return "text-green-700 font-semibold";
  if (pct >= 40) return "text-yellow-700";
  return "text-red-600";
}

// ─── Mini sparkline (SVG, no lib dependency) ─────────────────────────────────

function Sparkline({ days }: { days: ActivityDay[] }) {
  if (days.length === 0) {
    return <span className="text-xs text-gray-400">No activity</span>;
  }
  const W = 120;
  const H = 28;
  const max = Math.max(...days.map((d) => d.postsGenerated), 1);
  const pts = days
    .slice(-30) // last 30 days
    .map((d, i, arr) => {
      const x = (i / Math.max(arr.length - 1, 1)) * W;
      const y = H - (d.postsGenerated / max) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Retention bar ────────────────────────────────────────────────────────────

function RetentionBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className={retentionColor(pct)}>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all ${
            pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Conversion summary card ──────────────────────────────────────────────────

function ConversionCard({
  rate,
  converted,
  eligible,
}: {
  rate: number;
  converted: number;
  eligible: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">Trial → Paid conversion</p>
      <p className="mt-1 text-4xl font-bold text-gray-900">{rate}%</p>
      <p className="mt-1 text-xs text-gray-400">
        {converted} of {eligible} eligible tenant{eligible !== 1 ? "s" : ""} converted
        {eligible < eligible && " (tenants &lt; 7 days excluded)"}
      </p>
      <div className="mt-3 h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${
            rate >= 20 ? "bg-green-500" : rate >= 10 ? "bg-yellow-400" : "bg-red-400"
          }`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Per-vertical retention card ─────────────────────────────────────────────

function VerticalRetentionCard({
  vertical,
  retention,
}: {
  vertical: string;
  retention: { d7: number; d30: number; d60: number };
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-medium text-gray-700">{verticalLabel(vertical)}</p>
      <div className="space-y-2">
        <RetentionBar pct={retention.d7} label="Day 7" />
        <RetentionBar pct={retention.d30} label="Day 30" />
        <RetentionBar pct={retention.d60} label="Day 60" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OpsMetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.ops.getRetentionMetrics.query();
      setData(result as unknown as MetricsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  async function runBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const r = await trpc.ops.backfillMetrics.mutate();
      setBackfillResult(`Backfill complete — ${r.upserted} day-rows upserted`);
      await fetchMetrics();
    } catch (e) {
      setBackfillResult(`Backfill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBackfilling(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading retention metrics…</div>;
  }
  if (error) {
    return <div className="p-8 text-sm text-red-600">Error: {error}</div>;
  }
  if (!data) return null;

  const verticals = Object.keys(data.retentionByVertical);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ops — Retention Metrics</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Design-partner cohort · ADR-0016 · DE-CH beachhead
          </p>
        </div>
        <div className="flex items-center gap-3">
          {backfillResult && (
            <span className="text-xs text-gray-500">{backfillResult}</span>
          )}
          <button
            onClick={() => void runBackfill()}
            disabled={backfilling}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {backfilling ? "Backfilling…" : "Backfill from DB"}
          </button>
          <button
            onClick={() => void fetchMetrics()}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className={`grid gap-4 ${verticals.length > 0 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"}`}>
        <ConversionCard
          rate={data.conversionRate}
          converted={data.convertedCount}
          eligible={data.eligibleCount}
        />
        {verticals.map((v) => (
          <VerticalRetentionCard
            key={v}
            vertical={v}
            retention={data.retentionByVertical[v]!}
          />
        ))}
        {verticals.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-400">
            No retention data yet — run Backfill first or wait for tenants to post.
          </div>
        )}
      </div>

      {/* Design-partner table */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-800">
          Design Partners ({data.designPartners.length})
        </h2>

        {data.designPartners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
            No tenants yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Name",
                    "Vertical",
                    "Plan",
                    "Trial start",
                    "First post",
                    "First paid",
                    "Churned",
                    "Activity (30d)",
                    "D7",
                    "D30",
                    "D60",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.designPartners.map((p) => {
                  const dSinceTrial = daysSince(p.trialStartAt) ?? 0;
                  const vertical = p.vertical;
                  const _vRetention = data.retentionByVertical[vertical];
                  // Check if this specific tenant is active on D7/D30/D60.
                  const trialStart = new Date(p.trialStartAt);
                  function tenantDayActive(n: number): boolean | null {
                    if (dSinceTrial < n + 1) return null; // too new
                    const target = new Date(trialStart);
                    target.setUTCDate(target.getUTCDate() + n);
                    const targetStr = target.toISOString().slice(0, 10);
                    return (
                      p.activityDays.find((d) => d.date === targetStr)?.postsGenerated ?? 0
                    ) > 0;
                  }

                  function DayCell({ n }: { n: number }) {
                    const active = tenantDayActive(n);
                    if (active === null) return <td className="px-3 py-2.5 text-gray-300 text-xs">—</td>;
                    return (
                      <td className="px-3 py-2.5 text-xs">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 font-medium ${
                            active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {active ? "✓" : "✗"}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <tr
                      key={p.tenantId}
                      className={p.churnedAt ? "bg-red-50/40" : undefined}
                    >
                      <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                        {p.name}
                        {p.churnedAt && (
                          <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                            churned
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                        {verticalLabel(p.vertical)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${planBadgeClass(p.plan)}`}
                        >
                          {p.plan}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {fmtDate(p.trialStartAt)}
                        <span className="ml-1 text-gray-400">
                          (D+{dSinceTrial})
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {p.firstPostAt ? (
                          <span className="text-indigo-700">{fmtDate(p.firstPostAt)}</span>
                        ) : (
                          <span className="text-gray-400">No posts yet</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {p.firstPaidAt ? (
                          <span className="text-green-700">{fmtDate(p.firstPaidAt)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-gray-400">
                        {fmtDate(p.churnedAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Sparkline days={p.activityDays} />
                      </td>
                      <DayCell n={7} />
                      <DayCell n={30} />
                      <DayCell n={60} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Metric definition footnote (ADR-0016 §D1) */}
      <div className="rounded border border-gray-100 bg-gray-50 p-4 text-xs text-gray-400 space-y-1">
        <p className="font-medium text-gray-500">Metric definitions (ADR-0016 §D1)</p>
        <p>
          <strong>Trial→paid conversion</strong>: tenants with <code>first_paid_at IS NOT NULL</code> ÷ tenants
          whose trial started &gt; 7 days ago.
        </p>
        <p>
          <strong>Dₙ retention</strong>: % of eligible tenants (trial ≥ n+1 days old) who generated ≥ 1
          post on calendar day <em>trial_start + n</em>. Source: <code>tenant_metrics_daily</code>.
        </p>
        <p>
          <strong>Activity sparkline</strong>: daily <code>posts_generated</code> over last 30 days from{" "}
          <code>tenant_metrics_daily</code>.
        </p>
      </div>
    </div>
  );
}
