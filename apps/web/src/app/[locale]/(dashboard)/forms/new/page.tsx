"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "../../../../../lib/trpc";
import type { SmartForm } from "@marketing/ai-router";

// ─── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// ─── Simple form preview ───────────────────────────────────────────────────────

function FormPreview({ form }: { form: SmartForm }) {
  const stepCount = form.steps.length;
  return (
    <div className="space-y-4">
      {form.steps.map((step, si) => (
        <div key={si} className="rounded-lg border border-gray-200 bg-white p-4">
          {stepCount > 1 && (
            <p className="mb-2 text-xs text-gray-400">
              Schritt {si + 1} / {stepCount}
              {step.title ? ` — ${step.title}` : ""}
            </p>
          )}
          <div className="space-y-3">
            {step.fields.map((field, fi) => (
              <div key={fi}>
                <p className="text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-red-500">*</span>}
                  <span className="ml-1 font-normal text-gray-400">({field.type})</span>
                </p>
                {field.options && field.options.length > 0 && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {field.options.map((o) => o.label).join(", ")}
                  </p>
                )}
                {field.conditionalShowIf && (
                  <p className="mt-0.5 text-xs text-blue-400">
                    Shown when {field.conditionalShowIf.field} {field.conditionalShowIf.op} &quot;
                    {field.conditionalShowIf.value}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {form.submitLabel && (
        <p className="text-xs text-gray-500">Submit button: &quot;{form.submitLabel}&quot;</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewFormPage() {
  const t = useTranslations("Forms");
  const params = useParams();
  const locale = params["locale"] as string;
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedForm, setGeneratedForm] = useState<SmartForm | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!description.trim()) return;
    setGenerating(true);
    setGenError(null);
    setGeneratedForm(null);

    try {
      const result = await trpc.forms.aiGenerate.mutate({
        description: description.trim(),
        locale:
          locale === "de" ? "de-CH" : locale === "fr" ? "fr-CH" : locale === "it" ? "it-CH" : "en",
      });
      setGeneratedForm(result);
      // Pre-fill name from description
      if (!name) {
        const autoName = description.slice(0, 60).trim();
        setName(autoName);
        setSlug(toSlug(autoName));
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : t("generateError"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!generatedForm || !name || !slug) return;
    setSaving(true);
    setSaveError(null);

    try {
      const created = await trpc.forms.create.mutate({
        name,
        slug,
        schema: {},
        steps: generatedForm.steps,
        settings: generatedForm.settings,
        submitLabel: generatedForm.submitLabel ?? undefined,
      });
      router.push(`/${locale}/forms/${created.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t("newTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("newSubtitle")}</p>
      </div>

      {/* Step 1 — AI generation */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-semibold text-gray-900">1. {t("describeForm")}</h2>
        <form onSubmit={handleGenerate} className="space-y-4">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("describePlaceholder")}
            rows={4}
            required
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={generating || !description.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating && (
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
            )}
            {generating ? t("generating") : t("generateForm")}
          </button>
          {genError && <p className="text-sm text-red-500">{genError}</p>}
        </form>
      </div>

      {/* Step 2 — Review + save */}
      {generatedForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-gray-900">2. {t("reviewAndSave")}</h2>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: form preview */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("preview")}
              </p>
              <FormPreview form={generatedForm} />
            </div>

            {/* Right: name + slug */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("formDetails")}
              </p>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("formName")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSlug(toSlug(e.target.value));
                    }}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {t("formSlug")}
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    pattern="[a-z0-9-]+"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">{t("slugHint")}</p>
                </div>

                {saveError && <p className="text-sm text-red-500">{saveError}</p>}

                <button
                  type="submit"
                  disabled={saving || !name || !slug}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? t("saving") : t("saveForm")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
