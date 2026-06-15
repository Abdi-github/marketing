"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { trpc } from "../../../../lib/trpc";

type FormItem = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  leadCount: number;
  createdAt: string;
};

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FormsList({
  initialForms,
  total,
  locale,
}: {
  initialForms: FormItem[];
  total: number;
  locale: string;
}) {
  const t = useTranslations("Forms");
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeletingId(id);
    try {
      await trpc.forms.delete.mutate({ formId: id });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("deleteError"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(form: FormItem) {
    try {
      await trpc.forms.setActive.mutate({ formId: form.id, isActive: !form.isActive });
      router.refresh();
    } catch {
      alert(t("updateError"));
    }
  }

  if (initialForms.length === 0) {
    return (
      <div className="py-20 text-center text-gray-400">
        <p className="mb-1 text-lg font-medium">{t("empty")}</p>
        <p className="text-sm">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">{t("colName")}</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">{t("colSlug")}</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700">{t("colLeads")}</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-700">{t("colStatus")}</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">{t("colActions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {initialForms.map((form) => (
            <tr key={form.id} className="transition-colors hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{form.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{form.slug}</td>
              <td className="px-4 py-3 text-center text-gray-700">{form.leadCount}</td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => void handleToggleActive(form)}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                    form.isActive
                      ? "bg-green-100 text-green-800 hover:bg-green-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {form.isActive ? t("active") : t("inactive")}
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/${locale}/forms/${form.id}`}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    {t("edit")}
                  </Link>
                  <button
                    onClick={() => void handleDelete(form.id)}
                    disabled={deletingId === form.id || form.leadCount > 0}
                    title={form.leadCount > 0 ? t("deleteDisabledHint") : undefined}
                    className="text-red-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {deletingId === form.id ? (
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <TrashIcon />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > initialForms.length && (
        <div className="border-t px-4 py-3 text-center text-xs text-gray-400">
          {t("showing", { count: initialForms.length, total })}
        </div>
      )}
    </div>
  );
}
