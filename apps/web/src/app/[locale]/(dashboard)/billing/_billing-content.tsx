"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "../../../../lib/trpc";

const USD_TO_CHF = 0.9;

function formatChf(amount: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: amount < 1 ? 2 : 0,
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount);
}

type BillingSummary = {
  plan: string;
  monthlyAiBudgetUsd: number;
  mtdSpendUsd: number;
  nextResetDate: string;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
  } | null;
  recentInvoices: Array<{
    stripeInvoiceId: string;
    amountCents: number;
    currency: string;
    status: string;
    pdfUrl: string | null;
    paidAt: string | null;
  }>;
};

export function BillingContent({ summary, locale }: { summary: BillingSummary; locale: string }) {
  const t = useTranslations("Billing");
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const justUpgraded = searchParams?.get("upgraded") === "true";
  const canceled = searchParams?.get("canceled") === "true";

  const budgetChf = summary.monthlyAiBudgetUsd * USD_TO_CHF;
  const spendChf = summary.mtdSpendUsd * USD_TO_CHF;
  const budgetPct = Math.min(100, (summary.mtdSpendUsd / summary.monthlyAiBudgetUsd) * 100);
  const isBudgetExceeded = summary.mtdSpendUsd >= summary.monthlyAiBudgetUsd;
  const canUpgradeToGrowth = summary.plan !== "growth";
  const canUpgradeToStarter = summary.plan === "trial";
  const resetDate = new Date(summary.nextResetDate).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const planLabel = t(`plan_${summary.plan}` as "plan_trial" | "plan_starter" | "plan_growth");

  async function handleUpgrade(plan: "starter" | "growth") {
    setUpgrading(true);
    setError(null);
    try {
      const { checkoutUrl } = await trpc.billing.createCheckoutSession.mutate({ plan });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("upgradeError"));
      setUpgrading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>

        {justUpgraded && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {t("bannerUpgraded")}
          </div>
        )}

        {canceled && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {t("bannerCanceled")}
          </div>
        )}

        {isBudgetExceeded && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {t("budgetExceeded")}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Plan card */}
        <div className="space-y-4 rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {t("currentPlan")}
              </p>
              <p className="mt-0.5 text-xl font-semibold">{planLabel}</p>
              {summary.subscription && (
                <p className="mt-0.5 text-xs text-gray-400">
                  {t("subscriptionMeta", {
                    status: summary.subscription.status,
                    renewsOn: new Date(summary.subscription.currentPeriodEnd).toLocaleDateString(
                      locale,
                    ),
                  })}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{t("monthlyAiBudget")}</p>
              <p className="text-lg font-semibold">{formatChf(budgetChf, locale)}</p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {t("usdEquivalent", { usd: summary.monthlyAiBudgetUsd.toFixed(2) })}
              </p>
            </div>
          </div>

          {/* Spend bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t("usageThisMonth")}</span>
              <span>
                {formatChf(spendChf, locale)} / {formatChf(budgetChf, locale)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${
                  isBudgetExceeded
                    ? "bg-red-500"
                    : budgetPct > 80
                      ? "bg-yellow-400"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{t("nextReset", { date: resetDate })}</p>
          </div>
        </div>

        {/* Upgrade CTAs */}
        {(canUpgradeToStarter || canUpgradeToGrowth) && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow">
            <h2 className="text-sm font-semibold">{t("upgradeHeading")}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {canUpgradeToStarter && (
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="font-semibold">Starter</p>
                  <p className="text-2xl font-bold">
                    CHF 49{" "}
                    <span className="text-sm font-normal text-gray-500">/ {t("perMonth")}</span>
                  </p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    <li>{t("starterFeat1", { chf: formatChf(10 * USD_TO_CHF, locale) })}</li>
                    <li>{t("starterFeat2")}</li>
                    <li>{t("starterFeat3")}</li>
                  </ul>
                  <button
                    onClick={() => void handleUpgrade("starter")}
                    disabled={upgrading}
                    className="mt-2 w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {upgrading ? t("redirecting") : t("upgradeToStarter")}
                  </button>
                </div>
              )}
              {canUpgradeToGrowth && (
                <div className="space-y-2 rounded-lg border-2 border-black p-4">
                  <p className="font-semibold">Growth</p>
                  <p className="text-2xl font-bold">
                    CHF 149{" "}
                    <span className="text-sm font-normal text-gray-500">/ {t("perMonth")}</span>
                  </p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    <li>{t("growthFeat1", { chf: formatChf(40 * USD_TO_CHF, locale) })}</li>
                    <li>{t("growthFeat2")}</li>
                    <li>{t("growthFeat3")}</li>
                  </ul>
                  <button
                    onClick={() => void handleUpgrade("growth")}
                    disabled={upgrading}
                    className="mt-2 w-full rounded bg-black py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {upgrading ? t("redirecting") : t("upgradeToGrowth")}
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400">{t("upgradeFootnote")}</p>
          </div>
        )}

        {/* Recent invoices */}
        {summary.recentInvoices.length > 0 && (
          <div className="space-y-3 rounded-lg bg-white p-6 shadow">
            <h2 className="text-sm font-semibold">{t("recentInvoices")}</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-2 font-medium">{t("invDate")}</th>
                  <th className="pb-2 font-medium">{t("invAmount")}</th>
                  <th className="pb-2 font-medium">{t("invStatus")}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.recentInvoices.map((inv) => (
                  <tr key={inv.stripeInvoiceId}>
                    <td className="py-2 text-gray-700">
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString(locale) : "—"}
                    </td>
                    <td className="py-2 text-gray-700">
                      {inv.currency.toUpperCase()} {(inv.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          inv.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {inv.status === "paid" ? t("invPaid") : inv.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          PDF
                        </a>
                      )}
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
