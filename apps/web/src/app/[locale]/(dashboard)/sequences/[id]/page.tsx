"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc/routers";

type SequenceStep = { delay_minutes: number; template_id: string };

type Sequence = {
  id: string;
  name: string;
  triggerEvent: string;
  triggerFilter: Record<string, unknown>;
  status: string;
  steps: SequenceStep[];
};

type Enrollment = {
  id: string;
  contactId: string;
  currentStep: number;
  status: string;
  enrolledAt: Date | string;
  nextRunAt: Date | string;
  contactEmail: string;
  contactFirstName: string | null;
  contactLastName: string | null;
};

type TemplateOption = {
  id: string;
  name: string;
  subject: string;
  locale: string;
};

type ContactOption = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

type SenderSettings = {
  canSendProduction: boolean;
  readinessMessage: string;
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
  return `${Math.floor(hours / 24)}d`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function SequenceDetailPage() {
  const t = useTranslations("Sequences");
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const router = useRouter();

  const [seq, setSeq] = useState<Sequence | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollTotal, setEnrollTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [enrollContactId, setEnrollContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [senderSettings, setSenderSettings] = useState<SenderSettings | null>(null);

  useEffect(() => {
    const q = contactSearch.trim();
    if (q.length < 2) {
      setContactOptions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      trpc()
        .sequences.searchContacts.query({ query: q })
        .then((rows) => setContactOptions(rows as ContactOption[]))
        .catch(() => setContactOptions([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [contactSearch]);

  useEffect(() => {
    Promise.all([
      trpc().sequences.getSequence.query({ sequenceId: id }),
      trpc().sequences.listEnrollments.query({ sequenceId: id }),
      trpc().sequences.listTemplates.query(),
      trpc().sequences.getSenderSettings.query(),
    ])
      .then(([sequence, enrollResp, templateRows, settings]) => {
        setSeq(sequence as unknown as Sequence);
        setName((sequence as unknown as Sequence).name);
        setSteps(((sequence as unknown as Sequence).steps ?? []) as SequenceStep[]);
        setEnrollments(enrollResp.rows as unknown as Enrollment[]);
        setEnrollTotal(enrollResp.total);
        setTemplates(templateRows as TemplateOption[]);
        setSenderSettings(settings as SenderSettings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!seq || !name.trim()) return;
    if (steps.length > 0 && steps.some((step) => !step.template_id)) {
      setSaveError("Select a template for every step before saving.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await trpc().sequences.updateSequence.mutate({
        sequenceId: seq.id,
        name: name.trim(),
        steps,
      });
      setSeq((s) => (s ? { ...s, name: name.trim(), steps } : s));
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Failed to save sequence";
      try {
        const parsed = JSON.parse(msg) as Array<{ path: string[]; message: string }>;
        if (Array.isArray(parsed) && parsed[0]?.path) {
          const p = parsed[0].path;
          if (p[0] === "steps" && p[2] === "template_id") {
            msg = `Step ${Number(p[1]) + 1}: Template ID must be a valid UUID`;
          } else {
            msg = parsed[0].message ?? msg;
          }
        }
      } catch {
        // Keep the original error when the server did not return validation JSON.
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  function addStep() {
    const lastDelay = steps[steps.length - 1]?.delay_minutes ?? 0;
    setSteps((prev) => [...prev, { delay_minutes: lastDelay + 1440, template_id: "" }]);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, patch: Partial<SequenceStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleEnroll() {
    const rawContactId = enrollContactId.trim();
    const contactId = selectedContact?.id ?? (isUuid(rawContactId) ? rawContactId : "");
    if (!contactId || !seq) return;
    setEnrolling(true);
    setEnrollError(null);
    try {
      await trpc().sequences.enrollContact.mutate({
        sequenceId: seq.id,
        contactId,
      });
      setEnrollContactId("");
      setContactSearch("");
      setSelectedContact(null);
      const resp = await trpc().sequences.listEnrollments.query({ sequenceId: seq.id });
      setEnrollments(resp.rows as unknown as Enrollment[]);
      setEnrollTotal(resp.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enroll contact";
      setEnrollError(msg);
    } finally {
      setEnrolling(false);
    }
  }

  async function handleUnenroll(enrollment: Enrollment) {
    if (!seq) return;
    await trpc().sequences.unenrollContact.mutate({
      sequenceId: seq.id,
      contactId: enrollment.contactId,
    });
    setEnrollments((prev) =>
      prev.map((e) => (e.id === enrollment.id ? { ...e, status: "exited" } : e)),
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-sm text-gray-500">{t("loading")}</p>
      </div>
    );
  }

  if (!seq) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-sm text-red-500">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/${locale}/sequences`)}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← {t("backToList")}
        </button>
        <h1 className="flex-1 text-2xl font-semibold text-gray-900">{seq.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            seq.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {seq.status === "active" ? t("statusActive") : t("statusPaused")}
        </span>
      </div>

      <section
        className={`rounded-xl border p-5 ${
          senderSettings?.canSendProduction
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p
              className={`text-sm font-semibold ${
                senderSettings?.canSendProduction ? "text-emerald-900" : "text-amber-900"
              }`}
            >
              {senderSettings?.canSendProduction ? "Email sender ready" : "Email sender not ready"}
            </p>
            <p
              className={`mt-1 text-xs ${
                senderSettings?.canSendProduction ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              {senderSettings?.readinessMessage ??
                "Checking whether a production sender is configured."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/${locale}/emails/settings`)}
            className="text-xs font-semibold underline underline-offset-2"
          >
            Email settings
          </button>
        </div>
      </section>

      {/* Edit section */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">{t("settingsTitle")}</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">{t("nameLabel")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">{t("stepsTitle")}</h3>
            <button
              onClick={addStep}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              + {t("addStep")}
            </button>
          </div>

          <div className="space-y-2">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <div className="w-24 shrink-0">
                  <span className="text-xs text-gray-500">{t("stepDelay")}</span>
                  <input
                    type="number"
                    min={0}
                    value={step.delay_minutes}
                    onChange={(e) => updateStep(i, { delay_minutes: Number(e.target.value) })}
                    className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-gray-400">{delayLabel(step.delay_minutes)}</span>
                </div>
                <div className="flex-1">
                  <span className="text-xs text-gray-500">{t("stepTemplateId")}</span>
                  <select
                    value={step.template_id}
                    onChange={(e) => updateStep(i, { template_id: e.target.value })}
                    className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">Select a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.subject}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => removeStep(i)}
                  className="shrink-0 text-xs text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
            {steps.length === 0 && <p className="text-xs text-gray-400">{t("noSteps")}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
          {saveError && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {saveError}
            </p>
          )}
        </div>
      </section>

      {/* Manual enroll */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">{t("enrollTitle")}</h2>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <input
              type="text"
              value={selectedContact ? selectedContact.email : contactSearch}
              onChange={(e) => {
                setSelectedContact(null);
                setContactSearch(e.target.value);
                setEnrollContactId(e.target.value);
              }}
              placeholder="Search by name, email, or phone"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {contactOptions.length > 0 && !selectedContact && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {contactOptions.map((contact) => {
                  const name =
                    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                    contact.email;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        setSelectedContact(contact);
                        setEnrollContactId(contact.id);
                        setContactOptions([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">{name}</span>
                      <span className="block text-xs text-gray-500">
                        {contact.email}
                        {contact.phone ? ` · ${contact.phone}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={handleEnroll}
            disabled={
              enrolling ||
              !senderSettings?.canSendProduction ||
              !(selectedContact?.id || isUuid(enrollContactId.trim()))
            }
            title={
              !senderSettings?.canSendProduction
                ? "Configure a production sender before enrolling contacts."
                : undefined
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enrolling ? t("enrolling") : t("enroll")}
          </button>
        </div>
        {enrollError && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {enrollError}
          </p>
        )}
      </section>

      {/* Enrollments table */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-800">
            {t("enrollmentsTitle")} ({enrollTotal})
          </h2>
        </div>

        {enrollments.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-400">{t("noEnrollments")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("enrollColContact")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("enrollColStep")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("enrollColStatus")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("enrollColNextRun")}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">
                      {[e.contactFirstName, e.contactLastName].filter(Boolean).join(" ") ||
                        e.contactEmail}
                    </span>
                    <span className="block text-xs text-gray-400">{e.contactEmail}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{e.currentStep + 1}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        e.status === "enrolled"
                          ? "bg-blue-50 text-blue-700"
                          : e.status === "completed"
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(e.nextRunAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.status === "enrolled" && (
                      <button
                        onClick={() => handleUnenroll(e)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        {t("unenroll")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
