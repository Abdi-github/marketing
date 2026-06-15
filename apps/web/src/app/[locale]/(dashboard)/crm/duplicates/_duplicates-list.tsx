"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { trpc } from "../../../../../lib/trpc";

type DuplicateContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  leadScore: number;
  firstSeenAt: string;
};

type DuplicateGroup = {
  reason: "phone" | "name";
  key: string;
  contacts: DuplicateContact[];
};

function displayName(c: DuplicateContact): string {
  const n = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return n || c.email;
}

export function DuplicatesList({
  initialGroups,
  locale: _locale,
}: {
  initialGroups: DuplicateGroup[];
  locale: string;
}) {
  const t = useTranslations("Duplicates");
  const displayLocale = useLocale();
  const router = useRouter();
  const [primarySelection, setPrimarySelection] = useState<Record<string, string>>(() => {
    const sel: Record<string, string> = {};
    initialGroups.forEach((g) => {
      sel[g.key + ":" + g.reason] = g.contacts[0]?.id ?? "";
    });
    return sel;
  });
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMerge(group: DuplicateGroup) {
    const groupKey = group.key + ":" + group.reason;
    const primaryId = primarySelection[groupKey];
    if (!primaryId) return;
    const toMerge = group.contacts.filter((c) => c.id !== primaryId);
    if (toMerge.length === 0) return;
    if (!confirm(t("mergeConfirm", { count: toMerge.length }))) return;

    setMergingKey(groupKey);
    setError(null);
    try {
      for (const dup of toMerge) {
        await trpc.contacts.merge.mutate({ primaryId, mergeId: dup.id });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mergeError"));
    } finally {
      setMergingKey(null);
    }
  }

  return (
    <>
      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {initialGroups.map((group) => {
          const groupKey = group.key + ":" + group.reason;
          const primaryId = primarySelection[groupKey];
          const isMerging = mergingKey === groupKey;

          return (
            <div
              key={groupKey}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-5 py-3">
                <div>
                  <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {group.reason === "phone" ? t("reasonPhone") : t("reasonName")}
                  </span>
                  <span className="font-mono text-sm text-gray-700">{group.key}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {t("contactCount", { count: group.contacts.length })}
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {group.contacts.map((c) => {
                  const isPrimary = c.id === primaryId;
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors ${
                        isPrimary ? "bg-blue-50/50" : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={groupKey}
                        value={c.id}
                        checked={isPrimary}
                        onChange={() => setPrimarySelection((p) => ({ ...p, [groupKey]: c.id }))}
                        className="text-blue-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{displayName(c)}</span>
                          {isPrimary && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                              {t("keepAsPrimary")}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>{c.email}</span>
                          {c.phone && <span className="font-mono">{c.phone}</span>}
                          <span>{t("score", { n: c.leadScore })}</span>
                          <span>
                            {t("firstSeen", {
                              date: new Date(c.firstSeenAt).toLocaleDateString(displayLocale),
                            })}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
                <p className="max-w-xl text-xs text-gray-500">{t("mergeHint")}</p>
                <button
                  onClick={() => void handleMerge(group)}
                  disabled={isMerging || !primaryId}
                  className="whitespace-nowrap rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                >
                  {isMerging
                    ? t("merging")
                    : t("mergeButton", { count: group.contacts.length - 1 })}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
