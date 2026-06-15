"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc/routers";

type TriggerEvent =
  | "lead.captured"
  | "contact.score_changed"
  | "contact.lifecycle_changed"
  | "manual";

type SuggestedStep = {
  delay_minutes: number;
  suggested_subject: string;
  template_id?: string;
};

type TemplateOption = {
  id: string;
  name: string;
  subject: string;
  locale: string;
};

function trpc() {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/api/trpc" })],
  });
}

function delayLabel(minutes: number): string {
  if (minutes === 0) return "Immediately";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function NewSequencePage() {
  const t = useTranslations("Sequences");
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>("lead.captured");
  const [steps, setSteps] = useState<SuggestedStep[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestContext, setSuggestContext] = useState("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    trpc()
      .sequences.listTemplates.query()
      .then((rows) => setTemplates(rows as TemplateOption[]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  async function handleAISuggest() {
    setSuggesting(true);
    try {
      const result = await trpc().sequences.aiSuggestSequence.mutate({
        triggerEvent,
        context: suggestContext,
      });
      setName(result.name);
      setSteps(
        result.steps.map((s) => ({
          delay_minutes: s.delay_minutes,
          suggested_subject: s.suggested_subject,
        })),
      );
    } finally {
      setSuggesting(false);
    }
  }

  function addStep() {
    const lastDelay = steps[steps.length - 1]?.delay_minutes ?? 0;
    setSteps((prev) => [...prev, { delay_minutes: lastDelay + 1440, suggested_subject: "" }]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, patch: Partial<SuggestedStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleSave() {
    if (!name.trim()) return;
    const validSteps = steps.filter((s) => s.template_id);
    if (validSteps.length === 0) {
      setSaveError("Add at least one step with an email template.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const { id } = await trpc().sequences.createSequence.mutate({
        name: name.trim(),
        triggerEvent,
        steps: validSteps.map((s) => ({
          delay_minutes: s.delay_minutes,
          template_id: s.template_id!,
        })),
      });
      router.push(`/${locale}/sequences/${id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save sequence.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{t("newTitle")}</h1>

      {/* Name */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">{t("nameLabel")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </section>

      {/* Trigger */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">{t("triggerLabel")}</label>
        <select
          value={triggerEvent}
          onChange={(e) => setTriggerEvent(e.target.value as TriggerEvent)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="lead.captured">{t("trigger_lead_captured")}</option>
          <option value="contact.score_changed">{t("trigger_score_changed")}</option>
          <option value="contact.lifecycle_changed">{t("trigger_lifecycle_changed")}</option>
          <option value="manual">{t("trigger_manual")}</option>
        </select>
      </section>

      {/* AI Suggest */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("aiContextLabel")}
            </label>
            <input
              type="text"
              value={suggestContext}
              onChange={(e) => setSuggestContext(e.target.value)}
              placeholder={t("aiContextPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAISuggest}
            disabled={suggesting}
            className="whitespace-nowrap rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {suggesting ? t("suggesting") : t("aiSuggest")}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">{t("aiSuggestHint")}</p>
      </section>

      {/* Steps editor */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">{t("stepsTitle")}</h2>
          <button
            onClick={addStep}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            + {t("addStep")}
          </button>
        </div>

        {!templatesLoading && templates.length === 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create at least one email template before activating a sequence.{" "}
            <Link href={`/${locale}/emails/new`} className="font-medium underline">
              New template
            </Link>
          </div>
        )}

        {steps.length === 0 && <p className="text-sm text-gray-400">{t("noSteps")}</p>}

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
            >
              <div className="w-20 shrink-0">
                <label className="mb-0.5 block text-xs text-gray-500">{t("stepDelay")}</label>
                <input
                  type="number"
                  min={0}
                  value={step.delay_minutes}
                  onChange={(e) => updateStep(i, { delay_minutes: Number(e.target.value) })}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                />
                <span className="text-xs text-gray-400">{delayLabel(step.delay_minutes)}</span>
              </div>
              <div className="flex-1">
                <label className="mb-0.5 block text-xs text-gray-500">{t("stepTemplateId")}</label>
                <select
                  value={step.template_id ?? ""}
                  onChange={(e) => updateStep(i, { template_id: e.target.value })}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                >
                  <option value="">
                    {templatesLoading ? "Loading templates..." : "Select a template"}
                  </option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.subject}
                    </option>
                  ))}
                </select>
                {step.suggested_subject && (
                  <p className="mt-0.5 text-xs text-purple-600">
                    {t("stepSuggestedSubject")}: {step.suggested_subject}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeStep(i)}
                className="shrink-0 text-xs text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-gray-400">{t("stepTemplateHint")}</p>
        {saveError && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {saveError}
          </p>
        )}
      </section>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || templates.length === 0}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t("saving") : t("save")}
        </button>
        <button
          onClick={() => router.push(`/${locale}/sequences`)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
