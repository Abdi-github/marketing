"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { trpc } from "../../../../lib/trpc";

type TemplateRecord = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  locale: string;
};

// The merge tags users can insert. Matches the interpolate() helper in
// packages/integrations/resend/client.ts — keep these two in sync.
const VARIABLES: Array<{ key: string; label: string }> = [
  { key: "first_name", label: "{{first_name}}" },
  { key: "last_name", label: "{{last_name}}" },
  { key: "email", label: "{{email}}" },
  { key: "business_name", label: "{{business_name}}" },
];

function interpolatePreview(text: string): string {
  return text
    .replace(/\{\{first_name\}\}/g, "Anna")
    .replace(/\{\{last_name\}\}/g, "Beispiel")
    .replace(/\{\{email\}\}/g, "anna@example.ch")
    .replace(/\{\{business_name\}\}/g, "Café Bern");
}

export default function EmailComposer({ templateId }: { templateId?: string }) {
  const t = useTranslations("Emails");
  const locale = useLocale();
  const router = useRouter();

  const isNew = !templateId;

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [aiPurpose, setAiPurpose] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  // Load existing template when editing.
  useEffect(() => {
    if (!templateId) return;
    trpc.sequences.getTemplate
      .query({ templateId })
      .then((row) => {
        const t = row as unknown as TemplateRecord;
        setName(t.name);
        setSubject(t.subject);
        setBodyText(t.bodyText);
      })
      .catch(() => setError("Konnte Vorlage nicht laden."))
      .finally(() => setLoading(false));
  }, [templateId]);

  const canSave = name.trim().length > 0 && subject.trim().length > 0 && bodyText.trim().length > 0;
  const canSendTest = !isNew && testEmail.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      // We persist the same content as both HTML and plain-text. A future
      // step can add a rich editor that produces real HTML; for now the
      // textarea is treated as plain text and wrapped on send.
      const bodyHtml = textToHtml(bodyText);
      if (isNew) {
        const created = await trpc.sequences.createTemplate.mutate({
          name: name.trim(),
          subject: subject.trim(),
          bodyHtml,
          bodyText: bodyText.trim(),
          locale: localeToBcp47(locale),
        });
        setSavedAt(new Date());
        router.replace(`/${locale}/emails/${created.id}`);
      } else {
        await trpc.sequences.updateTemplate.mutate({
          templateId: templateId!,
          name: name.trim(),
          subject: subject.trim(),
          bodyHtml,
          bodyText: bodyText.trim(),
        });
        setSavedAt(new Date());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    if (!canSendTest || sending) return;
    setSending(true);
    setTestResult(null);
    setError(null);
    try {
      const r = await trpc.sequences.sendTestTemplate.mutate({
        templateId: templateId!,
        toEmail: testEmail.trim(),
      });
      setTestResult(r.sandbox ? t("testSandbox") : t("testSent", { email: testEmail.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("testError"));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!templateId) return;
    if (!confirm(t("deleteConfirm"))) return;
    try {
      await trpc.sequences.deleteTemplate.mutate({ templateId });
      router.push(`/${locale}/emails`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteError"));
    }
  }

  async function handleAiDraft() {
    if (aiPurpose.trim().length < 5 || aiDrafting) return;
    setAiDrafting(true);
    setError(null);
    try {
      const draft = await trpc.sequences.aiDraftTemplate.mutate({
        purpose: aiPurpose.trim(),
        tone: aiTone.trim() || undefined,
        locale: localeToBcp47(locale),
      });
      setSubject(draft.subject);
      setBodyText(draft.bodyText);
      if (!name) setName(aiPurpose.slice(0, 60));
      setShowAiDraft(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("aiDraftError"));
    } finally {
      setAiDrafting(false);
    }
  }

  function insertVariable(varLabel: string) {
    if (activeField === "subject") {
      setSubject((s) => s + varLabel);
    } else {
      setBodyText((b) => b + varLabel);
    }
  }

  const previewSubject = useMemo(() => interpolatePreview(subject), [subject]);
  const previewBody = useMemo(() => interpolatePreview(bodyText), [bodyText]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/${locale}/emails`} className="text-sm text-gray-500 hover:text-gray-700">
            ← {t("backToList")}
          </Link>
          <h1 className="text-xl font-bold text-gray-900">
            {isNew ? t("newTitle") : name || t("untitled")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-gray-400">
              {t("savedAt", { time: savedAt.toLocaleTimeString(locale) })}
            </span>
          )}
          {!isNew && (
            <button
              onClick={handleDelete}
              className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              {t("delete")}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Composer */}
        <div className="space-y-4">
          {/* AI draft trigger */}
          {!showAiDraft ? (
            <button
              onClick={() => setShowAiDraft(true)}
              className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-left text-sm text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              ✨ {t("aiDraftPrompt")}
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                {t("aiDraftHeading")}
              </p>
              <input
                type="text"
                value={aiPurpose}
                onChange={(e) => setAiPurpose(e.target.value)}
                placeholder={t("aiDraftPurposePlaceholder")}
                className="w-full rounded border border-indigo-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                type="text"
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                placeholder={t("aiDraftTonePlaceholder")}
                className="w-full rounded border border-indigo-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAiDraft(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleAiDraft}
                  disabled={aiPurpose.trim().length < 5 || aiDrafting}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {aiDrafting ? t("aiDrafting") : t("aiDraftGo")}
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              {t("fieldName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("fieldNamePlaceholder")}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              {t("fieldSubject")}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setActiveField("subject")}
              placeholder={t("fieldSubjectPlaceholder")}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              {t("fieldBody")}
            </label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              onFocus={() => setActiveField("body")}
              placeholder={t("fieldBodyPlaceholder")}
              rows={14}
              className="w-full resize-y rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">{t("plainTextHint")}</p>
          </div>

          {/* Send test */}
          {!isNew && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                {t("sendTestHeading")}
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder={t("sendTestPlaceholder")}
                  className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSendTest}
                  disabled={!canSendTest || sending}
                  className="whitespace-nowrap rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {sending ? t("sending") : t("sendTest")}
                </button>
              </div>
              {testResult && (
                <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                  {testResult}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right rail: variables + preview */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              {t("variablesHeading")}
            </p>
            <p className="mb-3 text-xs text-gray-500">{t("variablesHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.label)}
                  className="rounded bg-gray-100 px-2 py-1 font-mono text-xs transition-colors hover:bg-gray-200"
                  title={t(`var_${v.key}` as "var_first_name")}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
              {t("previewHeading")}
            </p>
            <div className="mb-1 text-xs text-gray-400">{t("previewSubject")}</div>
            <div className="mb-3 break-words text-sm font-medium text-gray-900">
              {previewSubject || <span className="text-gray-300">—</span>}
            </div>
            <div className="mb-1 text-xs text-gray-400">{t("previewBody")}</div>
            <div className="whitespace-pre-wrap border-l-2 border-gray-200 pl-3 text-sm leading-relaxed text-gray-700">
              {previewBody || <span className="text-gray-300">—</span>}
            </div>
            <p className="mt-3 text-xs italic text-gray-400">{t("previewFootnote")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Map next-intl locale ids → BCP-47 tags accepted by the schema's `locale` column.
function localeToBcp47(locale: string): string {
  switch (locale) {
    case "de":
      return "de-CH";
    case "fr":
      return "fr-CH";
    case "it":
      return "it-CH";
    case "en":
      return "en";
    default:
      return "de-CH";
  }
}

// Convert plain text body to HTML for storage. Wraps in a basic email shell
// so the saved bodyHtml renders correctly when sent through Resend.
function textToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;line-height:1.5">${paragraphs}</body></html>`;
}
