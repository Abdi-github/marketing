"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FORM_FIELD_TYPES,
  type FormField,
  type FormFieldType,
  type FormStep,
} from "@marketing/ai-router/form-schema";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { trpc } from "../../../../../lib/trpc";

type FormData = {
  id: string;
  name: string;
  slug: string;
  schema: Record<string, unknown>;
  steps: FormStep[] | null;
  isActive: boolean;
  submitLabel: string | null;
  settings: { honeypot?: boolean; turnstile_enabled?: boolean; success_message?: string } | null;
  landingPageId: string | null;
  tenantId: string;
};

type Option = { label: string; value: string };
type LeadStatus = "new" | "contacted" | "confirmed" | "qualified" | "archived";
type FormAnalytics = {
  periodDays: number;
  totals: {
    views: number;
    starts: number;
    submits: number;
    storedLeads: number;
    allTimeLeads: number;
    abandons: number;
    stepViews: number;
    stepCompletions: number;
    conversionRate: number;
    startRate: number;
    abandonmentRate: number;
  };
  funnel: Array<{ label: string; count: number }>;
  steps: Array<{
    stepIndex: number;
    stepTitle: string;
    views: number;
    completions: number;
    dropoffRate: number;
  }>;
};
type FormSubmission = {
  id: string;
  status: LeadStatus;
  workflowKind: "booking" | "callback" | "quote" | "generic";
  workflowState: string;
  sourceChannel: string;
  structuredData: Record<string, unknown>;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  submittedAt: string | Date;
  contactId: string | null;
  summary: {
    name: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    answers: Array<{ key: string; value: string }>;
  };
  workflow: {
    kind: "booking" | "callback" | "quote" | "generic";
    title: string;
    body: string;
    priority: "low" | "normal" | "high";
    dueInHours: number;
  };
  contact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    lifecycleStage: string | null;
    leadScore: number | null;
  } | null;
};
type FormSubmissions = {
  rows: FormSubmission[];
  total: number;
  page: number;
  pageSize: number;
};
type FormTemplate = {
  key: string;
  title: string;
  description: string;
  submitLabel: string;
  steps: FormStep[];
};

const LEAD_STATUSES: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "qualified", label: "Qualified" },
  { value: "archived", label: "Archived" },
];

const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  email: "Email",
  tel: "Phone",
  textarea: "Long text",
  select: "Dropdown",
  radio: "Multiple choice",
  checkbox: "Consent checkbox",
  number: "Number",
};

const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: "quote",
    title: "Quote request",
    description: "Lead capture for services, home visits, consultations, and custom offers.",
    submitLabel: "Request quote",
    steps: [
      {
        title: "Contact details",
        fields: [
          { name: "name", label: "Name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: false },
        ],
      },
      {
        title: "Project details",
        fields: [
          {
            name: "service",
            label: "What do you need?",
            type: "select",
            required: true,
            options: [
              { label: "Consultation", value: "consultation" },
              { label: "Custom quote", value: "custom_quote" },
              { label: "Support", value: "support" },
            ],
          },
          {
            name: "message",
            label: "Tell us more",
            type: "textarea",
            required: false,
            placeholder: "A few details help us prepare a useful reply.",
          },
        ],
      },
    ],
  },
  {
    key: "booking",
    title: "Booking request",
    description: "Good for restaurants, clinics, beauty salons, fitness, and appointments.",
    submitLabel: "Request booking",
    steps: [
      {
        title: "Your details",
        fields: [
          { name: "name", label: "Name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
        ],
      },
      {
        title: "Preferred time",
        fields: [
          { name: "date", label: "Preferred date", type: "text", required: true },
          { name: "time", label: "Preferred time", type: "text", required: false },
          {
            name: "party_size",
            label: "Number of people",
            type: "number",
            required: false,
            min: 1,
            max: 50,
          },
        ],
      },
    ],
  },
  {
    key: "newsletter",
    title: "Newsletter signup",
    description: "Short opt-in form for offers, launches, local updates, and events.",
    submitLabel: "Subscribe",
    steps: [
      {
        title: "Stay in touch",
        fields: [
          { name: "name", label: "Name", type: "text", required: false },
          { name: "email", label: "Email", type: "email", required: true },
          {
            name: "consent",
            label: "Consent",
            type: "checkbox",
            required: true,
            placeholder: "I agree to receive occasional updates.",
          },
        ],
      },
    ],
  },
  {
    key: "event",
    title: "Event signup",
    description: "Registration form for workshops, tastings, open days, and webinars.",
    submitLabel: "Reserve my spot",
    steps: [
      {
        title: "Registration",
        fields: [
          { name: "name", label: "Name", type: "text", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          {
            name: "attendees",
            label: "Attendees",
            type: "number",
            required: true,
            min: 1,
            max: 10,
          },
          {
            name: "notes",
            label: "Notes",
            type: "textarea",
            required: false,
            placeholder: "Dietary needs, questions, or accessibility notes.",
          },
        ],
      },
    ],
  },
];

function formatPercent(value: number): string {
  return `${Number.isFinite(value) ? value : 0}%`;
}

function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClasses(status: LeadStatus): string {
  if (status === "new") return "bg-blue-50 text-blue-700";
  if (status === "contacted") return "bg-amber-50 text-amber-700";
  if (status === "confirmed") return "bg-emerald-50 text-emerald-700";
  if (status === "qualified") return "bg-green-50 text-green-700";
  return "bg-gray-100 text-gray-600";
}

function workflowLabel(kind: FormSubmission["workflow"]["kind"]): string {
  if (kind === "booking") return "Booking";
  if (kind === "callback") return "Callback";
  if (kind === "quote") return "Quote";
  return "Lead";
}

function workflowClasses(kind: FormSubmission["workflow"]["kind"]): string {
  if (kind === "booking") return "bg-rose-50 text-rose-700";
  if (kind === "callback") return "bg-violet-50 text-violet-700";
  if (kind === "quote") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

function contactName(submission: FormSubmission): string {
  const fromContact = [submission.contact?.firstName, submission.contact?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fromContact || submission.summary.name || "Unknown lead";
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function SubmissionsPanel({
  submissions,
  loading,
  statusFilter,
  exporting,
  onStatusFilter,
  onSelect,
  onStatusChange,
  onExport,
}: {
  submissions: FormSubmissions | null;
  loading: boolean;
  statusFilter: LeadStatus | "all";
  exporting: boolean;
  onStatusFilter: (status: LeadStatus | "all") => void;
  onSelect: (submission: FormSubmission) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onExport: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Submissions</h2>
          <p className="mt-1 text-sm text-gray-500">
            Review recent leads, update status, and export responses.
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStatusFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            statusFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          All
        </button>
        {LEAD_STATUSES.map((status) => (
          <button
            key={status.value}
            type="button"
            onClick={() => onStatusFilter(status.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statusFilter === status.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>

      {loading && <div className="h-28 animate-pulse rounded-lg bg-gray-100" />}

      {!loading && submissions && submissions.rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <div className="divide-y divide-gray-100">
            {submissions.rows.map((submission) => (
              <div key={submission.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_160px_140px]">
                <button
                  type="button"
                  onClick={() => onSelect(submission)}
                  className="min-w-0 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{contactName(submission)}</p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${workflowClasses(
                        submission.workflow.kind,
                      )}`}
                    >
                      {workflowLabel(submission.workflow.kind)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${statusClasses(
                        submission.status,
                      )}`}
                    >
                      {submission.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-500">
                    {submission.summary.email || submission.summary.phone || "No contact field"}
                  </p>
                  {submission.summary.message && (
                    <p className="mt-1 line-clamp-1 text-sm text-gray-500">
                      {submission.summary.message}
                    </p>
                  )}
                </button>
                <div className="text-sm text-gray-500">
                  {formatDateTime(submission.submittedAt)}
                </div>
                <select
                  value={submission.status}
                  onChange={(event) =>
                    onStatusChange(submission.id, event.target.value as LeadStatus)
                  }
                  className="h-9 rounded-lg border border-gray-300 px-2 text-sm"
                >
                  {LEAD_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && submissions && submissions.rows.length === 0 && (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
          No submissions match this filter yet.
        </p>
      )}

      {!loading && submissions && submissions.total > submissions.rows.length && (
        <p className="mt-3 text-xs text-gray-400">
          Showing {submissions.rows.length} of {submissions.total} submissions.
        </p>
      )}
    </div>
  );
}

function SubmissionDrawer({
  submission,
  locale,
  onClose,
  onStatusChange,
}: {
  submission: FormSubmission | null;
  locale: string;
  onClose: () => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
}) {
  if (!submission) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/40" role="dialog" aria-modal="true">
      <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Submission</p>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">
                {contactName(submission)}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{formatDateTime(submission.submittedAt)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoBox label="Email" value={submission.summary.email || submission.contact?.email} />
            <InfoBox label="Phone" value={submission.summary.phone || submission.contact?.phone} />
            <InfoBox label="Lead type" value={workflowLabel(submission.workflow.kind)} />
            <InfoBox label="Source" value={submission.sourceChannel} />
            <InfoBox label="Status" value={submission.status} />
            <InfoBox label="Workflow state" value={submission.workflowState} />
            <InfoBox
              label="CRM stage"
              value={submission.contact?.lifecycleStage || "No linked contact"}
            />
            <InfoBox label="Recommended action" value={submission.workflow.title} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Update status</label>
            <select
              value={submission.status}
              onChange={(event) => onStatusChange(submission.id, event.target.value as LeadStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Answers</h3>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {submission.summary.answers.map((answer) => (
                <div key={answer.key} className="grid gap-1 p-3 sm:grid-cols-[150px_1fr]">
                  <p className="font-mono text-xs text-gray-400">{answer.key}</p>
                  <p className="text-sm text-gray-700">{answer.value}</p>
                </div>
              ))}
            </div>
          </div>

          {submission.sourceUrl && <InfoBox label="Source URL" value={submission.sourceUrl} mono />}
          <InfoBox label="Workflow note" value={submission.workflow.body} />
        </div>

        <div className="border-t border-gray-200 p-6">
          <div className="flex flex-wrap gap-2">
            {submission.contact?.id && (
              <a
                href={`/${locale}/crm`}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
              >
                Open CRM
              </a>
            )}
            {submission.summary.email && (
              <a
                href={`mailto:${submission.summary.email}`}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
              >
                Email lead
              </a>
            )}
            {submission.summary.phone && (
              <a
                href={`tel:${submission.summary.phone}`}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
              >
                Call
              </a>
            )}
            <a
              href={`/${locale}/crm/deals`}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Create deal
            </a>
            <a
              href={`/${locale}/crm/segments`}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Add to segment
            </a>
            <a
              href={`/${locale}/sequences/new`}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Start sequence
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 break-words text-sm text-gray-800 ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function AnalyticsPanel({
  analytics,
  loading,
}: {
  analytics: FormAnalytics | null;
  loading: boolean;
}) {
  const maxFunnelCount = Math.max(1, ...(analytics?.funnel.map((item) => item.count) ?? [1]));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Analytics</h2>
          <p className="mt-1 text-sm text-gray-500">
            {analytics ? `Last ${analytics.periodDays} days` : "Loading recent form activity"}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
          Consent-based
        </span>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {["", "", "", ""].map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && analytics && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Views" value={analytics.totals.views} />
            <MetricCard label="Starts" value={analytics.totals.starts} />
            <MetricCard label="Submits" value={analytics.totals.submits} />
            <MetricCard label="Leads" value={analytics.totals.storedLeads} />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <RatePill label="Start" value={formatPercent(analytics.totals.startRate)} />
            <RatePill label="Convert" value={formatPercent(analytics.totals.conversionRate)} />
            <RatePill label="Drop-off" value={formatPercent(analytics.totals.abandonmentRate)} />
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Funnel</h3>
            <div className="space-y-3">
              {analytics.funnel.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>{item.label}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.max(4, (item.count / maxFunnelCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Step drop-off</h3>
            {analytics.steps.length > 0 ? (
              <div className="space-y-2">
                {analytics.steps.map((step) => (
                  <div
                    key={`${step.stepIndex}-${step.stepTitle}`}
                    className="rounded-lg bg-gray-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{step.stepTitle}</p>
                        <p className="text-xs text-gray-500">
                          {step.views} views, {step.completions} completions
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        {formatPercent(step.dropoffRate)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                No step activity yet.
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400">
            All-time leads: {analytics.totals.allTimeLeads}. Analytics events are recorded only
            after visitor consent.
          </p>
        </div>
      )}

      {!loading && !analytics && (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Analytics unavailable.</p>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function RatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-blue-50 px-2 py-2">
      <p className="text-xs font-medium text-blue-500">{label}</p>
      <p className="text-sm font-semibold text-blue-900">{value}</p>
    </div>
  );
}

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug || "field";
}

function uniqueFieldName(label: string, steps: FormStep[]): string {
  const base = toSlug(label);
  const names = new Set(steps.flatMap((step) => step.fields.map((field) => field.name)));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function cloneSteps(steps: FormStep[]): FormStep[] {
  return JSON.parse(JSON.stringify(steps)) as FormStep[];
}

function createEditorSnapshot(input: {
  name: string;
  submitLabel: string;
  successMessage: string;
  honeypot: boolean;
  turnstile: boolean;
  steps: FormStep[];
}) {
  return JSON.stringify({
    name: input.name,
    submitLabel: input.submitLabel,
    successMessage: input.successMessage,
    honeypot: input.honeypot,
    turnstile: input.turnstile,
    steps: sanitizeSteps(input.steps),
  });
}

function newField(steps: FormStep[], type: FormFieldType = "text"): FormField {
  const label = type === "checkbox" ? "I agree to be contacted" : "New question";
  return {
    name: uniqueFieldName(label, steps),
    type,
    label,
    placeholder: type === "checkbox" ? label : "",
    required: false,
    options:
      type === "select" || type === "radio"
        ? [{ label: "Option 1", value: "option_1" }]
        : undefined,
  };
}

function legacySchemaToSteps(schema: Record<string, unknown>): FormStep[] {
  const properties = (schema["properties"] ?? {}) as Record<
    string,
    { title?: string; type?: string }
  >;
  const required = Array.isArray(schema["required"]) ? (schema["required"] as string[]) : [];
  const fields = Object.entries(properties).map(([name, def]) => ({
    name,
    label: def.title ?? name,
    type: (name === "email"
      ? "email"
      : name === "phone" || name === "tel"
        ? "tel"
        : "text") as FormFieldType,
    required: required.includes(name),
  }));
  return [
    {
      title: "Contact details",
      fields:
        fields.length > 0
          ? fields
          : [
              { name: "name", label: "Name", type: "text", required: true },
              { name: "email", label: "Email", type: "email", required: true },
            ],
    },
  ];
}

function sanitizeSteps(steps: FormStep[]): FormStep[] {
  const usedNames = new Set<string>();
  return steps.slice(0, 5).map((step, stepIndex) => ({
    title: step.title?.trim() || (steps.length > 1 ? `Step ${stepIndex + 1}` : undefined),
    fields: step.fields.slice(0, 20).map((field) => ({
      ...field,
      name: (() => {
        const base = toSlug(field.name || field.label);
        let name = base;
        let index = 2;
        while (usedNames.has(name)) {
          name = `${base}_${index}`;
          index += 1;
        }
        usedNames.add(name);
        return name;
      })(),
      label: field.label.trim() || "Question",
      placeholder: field.placeholder?.trim() || undefined,
      options:
        field.type === "select" || field.type === "radio"
          ? (field.options ?? [])
              .filter((option) => option.label.trim())
              .map((option) => ({
                label: option.label.trim(),
                value: toSlug(option.value || option.label),
              }))
          : undefined,
      min: field.type === "number" ? field.min : undefined,
      max: field.type === "number" ? field.max : undefined,
      conditionalShowIf:
        field.conditionalShowIf?.field && field.conditionalShowIf.value
          ? field.conditionalShowIf
          : undefined,
    })),
  }));
}

function EmbedCode({ tenantSlug, formSlug }: { tenantSlug: string; formSlug: string }) {
  const t = useTranslations("Forms");
  const [copied, setCopied] = useState(false);

  const embedUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/embed/forms/${tenantSlug}/${formSlug}`
      : `/embed/forms/${tenantSlug}/${formSlug}`;

  const code = `<iframe src="${embedUrl}" width="100%" height="560" frameborder="0" style="border:none;border-radius:8px"></iframe>`;

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{t("embedCode")}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-950 p-4 text-xs text-green-300">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        {copied ? "Copied" : t("copyEmbed")}
      </button>
    </div>
  );
}

function FieldPreview({ field }: { field: FormField }) {
  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500";
  if (field.type === "textarea")
    return <textarea disabled rows={3} placeholder={field.placeholder} className={inputClass} />;
  if (field.type === "select") {
    return (
      <select disabled className={inputClass}>
        <option>{field.placeholder || "Choose an option"}</option>
      </select>
    );
  }
  if (field.type === "radio") {
    return (
      <div className="space-y-2">
        {(field.options ?? []).map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-gray-600">
            <input disabled type="radio" />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input disabled type="checkbox" />
        {field.placeholder || field.label}
      </label>
    );
  }
  return (
    <input disabled type={field.type} placeholder={field.placeholder} className={inputClass} />
  );
}

function FormPreview({ steps, submitLabel }: { steps: FormStep[]; submitLabel: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="space-y-5">
        {steps.map((step, stepIndex) => (
          <div key={stepIndex} className={stepIndex > 0 ? "border-t border-gray-100 pt-5" : ""}>
            {steps.length > 1 && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Step {stepIndex + 1} of {steps.length}
              </p>
            )}
            {step.title && (
              <h3 className="mb-4 text-sm font-semibold text-gray-900">{step.title}</h3>
            )}
            <div className="space-y-4">
              {step.fields.map((field) => (
                <label key={field.name} className="block">
                  {field.type !== "checkbox" && (
                    <span className="mb-1 block text-sm font-medium text-gray-700">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </span>
                  )}
                  <FieldPreview field={field} />
                  {field.conditionalShowIf && (
                    <span className="mt-1 block text-xs text-blue-500">
                      Shows when {field.conditionalShowIf.field} {field.conditionalShowIf.op}{" "}
                      {field.conditionalShowIf.value}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-80"
        >
          {submitLabel || "Submit"}
        </button>
      </div>
    </div>
  );
}

export default function FormDetailPage() {
  const t = useTranslations("Forms");
  const params = useParams();
  const formId = params["id"] as string;
  const locale = (params["locale"] as string | undefined) ?? "en";

  const [form, setForm] = useState<FormData | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [analytics, setAnalytics] = useState<FormAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [submissions, setSubmissions] = useState<FormSubmissions | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<LeadStatus | "all">("all");
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [exportingSubmissions, setExportingSubmissions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [submitLabel, setSubmitLabel] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [honeypot, setHoneypot] = useState(true);
  const [turnstile, setTurnstile] = useState(false);
  const [steps, setSteps] = useState<FormStep[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialSnapshotRef = useRef("");

  const allFields = useMemo(() => steps.flatMap((step) => step.fields), [steps]);
  const currentSnapshot = useMemo(
    () => createEditorSnapshot({ name, submitLabel, successMessage, honeypot, turnstile, steps }),
    [honeypot, name, steps, submitLabel, successMessage, turnstile],
  );
  const isDirty = Boolean(form) && currentSnapshot !== initialSnapshotRef.current;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setAnalyticsLoading(true);
      setSubmissionsLoading(true);
      try {
        const [formResult, slugResult] = await Promise.all([
          trpc.forms.get.query({ formId }),
          trpc.tenancy.getSlug.query(),
        ]);
        const analyticsResult = await trpc.forms.getAnalytics
          .query({ formId, days: 30 })
          .catch(() => null);
        const submissionsResult = await trpc.forms.listSubmissions
          .query({ formId, page: 1, pageSize: 10 })
          .catch(() => null);
        const f = formResult as FormData;
        const nextSubmitLabel = f.submitLabel ?? "";
        const nextSettings = f.settings ?? {};
        const nextSuccessMessage = nextSettings.success_message ?? "";
        const nextHoneypot = nextSettings.honeypot !== false;
        const nextTurnstile = nextSettings.turnstile_enabled === true;
        const nextSteps =
          f.steps && f.steps.length > 0 ? f.steps : legacySchemaToSteps(f.schema ?? {});
        setForm(f);
        setName(f.name);
        setSubmitLabel(nextSubmitLabel);
        setHoneypot(nextHoneypot);
        setTurnstile(nextTurnstile);
        setSuccessMessage(nextSuccessMessage);
        setSteps(nextSteps);
        setTenantSlug(slugResult.slug);
        setAnalytics(analyticsResult as FormAnalytics | null);
        setSubmissions(submissionsResult as FormSubmissions | null);
        initialSnapshotRef.current = createEditorSnapshot({
          name: f.name,
          submitLabel: nextSubmitLabel,
          successMessage: nextSuccessMessage,
          honeypot: nextHoneypot,
          turnstile: nextTurnstile,
          steps: nextSteps,
        });
      } catch {
        setError(t("loadError"));
      } finally {
        setLoading(false);
        setAnalyticsLoading(false);
        setSubmissionsLoading(false);
      }
    }
    void load();
  }, [formId, t]);

  async function refreshAnalytics() {
    setAnalyticsLoading(true);
    try {
      const result = await trpc.forms.getAnalytics.query({ formId, days: 30 });
      setAnalytics(result as FormAnalytics);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function refreshSubmissions(status: LeadStatus | "all" = submissionStatusFilter) {
    setSubmissionsLoading(true);
    try {
      const result = await trpc.forms.listSubmissions.query({
        formId,
        status: status === "all" ? undefined : status,
        page: 1,
        pageSize: 10,
      });
      setSubmissions(result as FormSubmissions);
    } finally {
      setSubmissionsLoading(false);
    }
  }

  function handleSubmissionFilter(status: LeadStatus | "all") {
    setSubmissionStatusFilter(status);
    void refreshSubmissions(status);
  }

  async function updateSubmissionStatus(leadId: string, status: LeadStatus) {
    await trpc.forms.updateSubmissionStatus.mutate({ leadId, status });
    setSubmissions((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((submission) =>
              submission.id === leadId ? { ...submission, status } : submission,
            ),
          }
        : prev,
    );
    setSelectedSubmission((prev) => (prev?.id === leadId ? { ...prev, status } : prev));
    void refreshAnalytics();
  }

  async function exportSubmissions() {
    setExportingSubmissions(true);
    try {
      const result = await trpc.forms.exportSubmissions.query({
        formId,
        status: submissionStatusFilter === "all" ? undefined : submissionStatusFilter,
      });
      downloadCsv(result.filename, result.csv);
    } finally {
      setExportingSubmissions(false);
    }
  }

  function updateStep(stepIndex: number, patch: Partial<FormStep>) {
    setSteps((prev) =>
      prev.map((step, index) => (index === stepIndex ? { ...step, ...patch } : step)),
    );
  }

  function addStep() {
    setSteps((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, { title: `Step ${prev.length + 1}`, fields: [newField(prev)] }];
    });
  }

  function duplicateStep(stepIndex: number) {
    setSteps((prev) => {
      if (prev.length >= 5) return prev;
      const source = prev[stepIndex];
      if (!source) return prev;
      const copy = cloneSteps([source])[0]!;
      const next = [...prev];
      copy.title = `${copy.title || `Step ${stepIndex + 1}`} copy`;
      copy.fields = copy.fields.map((field) => ({
        ...field,
        name: uniqueFieldName(`${field.name}_copy`, next),
      }));
      next.splice(stepIndex + 1, 0, copy);
      return next;
    });
  }

  function removeStep(stepIndex: number) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, index) => index !== stepIndex)));
  }

  function moveStep(stepIndex: number, direction: -1 | 1) {
    setSteps((prev) => {
      const nextIndex = stepIndex + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(stepIndex, 1);
      next.splice(nextIndex, 0, item!);
      return next;
    });
  }

  function updateField(stepIndex: number, fieldIndex: number, patch: Partial<FormField>) {
    setSteps((prev) =>
      prev.map((step, index) =>
        index === stepIndex
          ? {
              ...step,
              fields: step.fields.map((field, fi) =>
                fi === fieldIndex ? { ...field, ...patch } : field,
              ),
            }
          : step,
      ),
    );
  }

  function addField(stepIndex: number, type: FormFieldType = "text") {
    setSteps((prev) =>
      prev.map((step, index) =>
        index === stepIndex && step.fields.length < 20
          ? { ...step, fields: [...step.fields, newField(prev, type)] }
          : step,
      ),
    );
  }

  function duplicateField(stepIndex: number, fieldIndex: number) {
    setSteps((prev) =>
      prev.map((step, index) => {
        if (index !== stepIndex || step.fields.length >= 20) return step;
        const source = step.fields[fieldIndex];
        if (!source) return step;
        const field = cloneSteps([{ fields: [source] }])[0]!.fields[0]!;
        field.label = `${field.label} copy`;
        field.name = uniqueFieldName(field.name, prev);
        const fields = [...step.fields];
        fields.splice(fieldIndex + 1, 0, field);
        return { ...step, fields };
      }),
    );
  }

  function removeField(stepIndex: number, fieldIndex: number) {
    setSteps((prev) =>
      prev.map((step, index) =>
        index === stepIndex && step.fields.length > 1
          ? { ...step, fields: step.fields.filter((_, fi) => fi !== fieldIndex) }
          : step,
      ),
    );
  }

  function moveField(stepIndex: number, fieldIndex: number, direction: -1 | 1) {
    setSteps((prev) =>
      prev.map((step, index) => {
        if (index !== stepIndex) return step;
        const nextIndex = fieldIndex + direction;
        if (nextIndex < 0 || nextIndex >= step.fields.length) return step;
        const fields = [...step.fields];
        const [item] = fields.splice(fieldIndex, 1);
        fields.splice(nextIndex, 0, item!);
        return { ...step, fields };
      }),
    );
  }

  function updateOption(
    stepIndex: number,
    fieldIndex: number,
    optionIndex: number,
    patch: Partial<Option>,
  ) {
    const field = steps[stepIndex]?.fields[fieldIndex];
    const options = field?.options ?? [];
    updateField(stepIndex, fieldIndex, {
      options: options.map((option, index) =>
        index === optionIndex ? { ...option, ...patch } : option,
      ),
    });
  }

  function applyTemplate(template: FormTemplate) {
    setSteps(cloneSteps(template.steps));
    setSubmitLabel(template.submitLabel);
  }

  function addOption(stepIndex: number, fieldIndex: number) {
    const field = steps[stepIndex]?.fields[fieldIndex];
    const options = field?.options ?? [];
    updateField(stepIndex, fieldIndex, {
      options: [
        ...options,
        { label: `Option ${options.length + 1}`, value: `option_${options.length + 1}` },
      ],
    });
  }

  function removeOption(stepIndex: number, fieldIndex: number, optionIndex: number) {
    const field = steps[stepIndex]?.fields[fieldIndex];
    const options = field?.options ?? [];
    updateField(stepIndex, fieldIndex, {
      options: options.length <= 1 ? options : options.filter((_, index) => index !== optionIndex),
    });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaveOk(false);
    setSaveError(null);

    const nextSteps = sanitizeSteps(steps);
    const nextSettings = {
      honeypot,
      turnstile_enabled: turnstile,
      success_message: successMessage || undefined,
    };

    try {
      await trpc.forms.update.mutate({
        formId,
        name,
        slug: form.slug,
        schema: form.schema ?? {},
        steps: nextSteps,
        submitLabel: submitLabel || undefined,
        landingPageId: form.landingPageId ?? undefined,
        settings: nextSettings,
      });
      setSteps(nextSteps);
      setForm((prev) =>
        prev
          ? {
              ...prev,
              name,
              steps: nextSteps,
              submitLabel: submitLabel || null,
              settings: nextSettings,
            }
          : prev,
      );
      initialSnapshotRef.current = createEditorSnapshot({
        name,
        submitLabel,
        successMessage,
        honeypot,
        turnstile,
        steps: nextSteps,
      });
      void refreshAnalytics();
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <svg
          className="h-6 w-6 animate-spin text-blue-500"
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
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? t("loadError")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">/{form.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Unsaved changes
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {form.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]"
      >
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-5 font-semibold text-gray-900">{t("formSettings")}</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  {t("formName")}
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  {t("submitLabel")}
                </span>
                <input
                  type="text"
                  value={submitLabel}
                  onChange={(e) => setSubmitLabel(e.target.value)}
                  placeholder={t("submitLabelPlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  {t("successMessage")}
                </span>
                <input
                  type="text"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  placeholder={t("successMessagePlaceholder")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-5">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={honeypot}
                  onChange={(e) => setHoneypot(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">{t("honeypotLabel")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={turnstile}
                  onChange={(e) => setTurnstile(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">{t("turnstileLabel")}</span>
              </label>
            </div>
          </div>

          <SubmissionsPanel
            submissions={submissions}
            loading={submissionsLoading}
            statusFilter={submissionStatusFilter}
            exporting={exportingSubmissions}
            onStatusFilter={handleSubmissionFilter}
            onSelect={setSelectedSubmission}
            onStatusChange={(leadId, status) => void updateSubmissionStatus(leadId, status)}
            onExport={() => void exportSubmissions()}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-gray-900">Starter templates</h2>
              <p className="mt-1 text-sm text-gray-500">
                Replace the current questions with a proven form pattern, then customize freely.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {FORM_TEMPLATES.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-lg border border-gray-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="block text-sm font-semibold text-gray-900">
                    {template.title}
                  </span>
                  <span className="mt-1 block text-sm text-gray-500">{template.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Form builder</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Edit questions, steps, choices, and display logic.
                </p>
              </div>
              <button
                type="button"
                onClick={addStep}
                disabled={steps.length >= 5}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Add step
              </button>
            </div>

            <div className="space-y-5">
              {steps.map((step, stepIndex) => (
                <div key={stepIndex} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <input
                      value={step.title ?? ""}
                      onChange={(e) => updateStep(stepIndex, { title: e.target.value })}
                      placeholder={`Step ${stepIndex + 1}`}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => moveStep(stepIndex, -1)}
                      className="rounded border px-2 py-1 text-sm"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(stepIndex, 1)}
                      className="rounded border px-2 py-1 text-sm"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateStep(stepIndex)}
                      disabled={steps.length >= 5}
                      className="rounded border px-2 py-1 text-sm disabled:opacity-30"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(stepIndex)}
                      disabled={steps.length <= 1}
                      className="rounded border border-red-200 px-2 py-1 text-sm text-red-600 disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="space-y-4">
                    {step.fields.map((field, fieldIndex) => {
                      const conditionTargets = allFields.filter(
                        (candidate) => candidate.name !== field.name,
                      );
                      const hasChoices = field.type === "select" || field.type === "radio";
                      return (
                        <div
                          key={`${field.name}-${fieldIndex}`}
                          className="rounded-lg border border-gray-200 bg-white p-4"
                        >
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_170px]">
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Label
                              </span>
                              <input
                                value={field.label}
                                onChange={(e) =>
                                  updateField(stepIndex, fieldIndex, { label: e.target.value })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Type
                              </span>
                              <select
                                value={field.type}
                                onChange={(e) => {
                                  const type = e.target.value as FormFieldType;
                                  updateField(stepIndex, fieldIndex, {
                                    type,
                                    options:
                                      type === "select" || type === "radio"
                                        ? field.options?.length
                                          ? field.options
                                          : [{ label: "Option 1", value: "option_1" }]
                                        : undefined,
                                    min: type === "number" ? field.min : undefined,
                                    max: type === "number" ? field.max : undefined,
                                  });
                                }}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              >
                                {FORM_FIELD_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {FIELD_TYPE_LABELS[type]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Field key
                              </span>
                              <input
                                value={field.name}
                                onChange={(e) =>
                                  updateField(stepIndex, fieldIndex, {
                                    name: toSlug(e.target.value),
                                  })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Required
                              </span>
                              <select
                                value={field.required ? "yes" : "no"}
                                onChange={(e) =>
                                  updateField(stepIndex, fieldIndex, {
                                    required: e.target.value === "yes",
                                  })
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                              >
                                <option value="no">Optional</option>
                                <option value="yes">Required</option>
                              </select>
                            </label>
                            {field.type !== "checkbox" && (
                              <label className="block lg:col-span-2">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Placeholder
                                </span>
                                <input
                                  value={field.placeholder ?? ""}
                                  onChange={(e) =>
                                    updateField(stepIndex, fieldIndex, {
                                      placeholder: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                              </label>
                            )}
                          </div>

                          {field.type === "number" && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Min
                                </span>
                                <input
                                  type="number"
                                  value={field.min ?? ""}
                                  onChange={(e) =>
                                    updateField(stepIndex, fieldIndex, {
                                      min: e.target.value ? Number(e.target.value) : undefined,
                                    })
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Max
                                </span>
                                <input
                                  type="number"
                                  value={field.max ?? ""}
                                  onChange={(e) =>
                                    updateField(stepIndex, fieldIndex, {
                                      max: e.target.value ? Number(e.target.value) : undefined,
                                    })
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                              </label>
                            </div>
                          )}

                          {hasChoices && (
                            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Choices
                                </p>
                                <button
                                  type="button"
                                  onClick={() => addOption(stepIndex, fieldIndex)}
                                  className="text-xs font-medium text-blue-600"
                                >
                                  Add choice
                                </button>
                              </div>
                              <div className="space-y-2">
                                {(field.options ?? []).map((option, optionIndex) => (
                                  <div
                                    key={optionIndex}
                                    className="grid grid-cols-[1fr_1fr_auto] gap-2"
                                  >
                                    <input
                                      value={option.label}
                                      onChange={(e) =>
                                        updateOption(stepIndex, fieldIndex, optionIndex, {
                                          label: e.target.value,
                                        })
                                      }
                                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                    <input
                                      value={option.value}
                                      onChange={(e) =>
                                        updateOption(stepIndex, fieldIndex, optionIndex, {
                                          value: toSlug(e.target.value),
                                        })
                                      }
                                      className="rounded border border-gray-300 px-2 py-1 font-mono text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeOption(stepIndex, fieldIndex, optionIndex)
                                      }
                                      className="rounded border px-2 text-xs text-red-600"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={Boolean(field.conditionalShowIf)}
                                disabled={conditionTargets.length === 0}
                                onChange={(e) =>
                                  updateField(stepIndex, fieldIndex, {
                                    conditionalShowIf: e.target.checked
                                      ? {
                                          field: conditionTargets[0]?.name ?? "",
                                          op: "eq",
                                          value: "",
                                        }
                                      : undefined,
                                  })
                                }
                              />
                              Conditional display
                            </label>
                            {field.conditionalShowIf && (
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_1fr]">
                                <select
                                  value={field.conditionalShowIf.field}
                                  onChange={(e) =>
                                    updateField(stepIndex, fieldIndex, {
                                      conditionalShowIf: {
                                        ...field.conditionalShowIf!,
                                        field: e.target.value,
                                      },
                                    })
                                  }
                                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                                >
                                  {conditionTargets.map((candidate) => (
                                    <option key={candidate.name} value={candidate.name}>
                                      {candidate.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={field.conditionalShowIf.op}
                                  onChange={(e) =>
                                    updateField(stepIndex, fieldIndex, {
                                      conditionalShowIf: {
                                        ...field.conditionalShowIf!,
                                        op: e.target.value as "eq" | "neq" | "contains",
                                      },
                                    })
                                  }
                                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                                >
                                  <option value="eq">is</option>
                                  <option value="neq">is not</option>
                                  <option value="contains">contains</option>
                                </select>
                                <input
                                  value={field.conditionalShowIf.value}
                                  onChange={(e) =>
                                    updateField(stepIndex, fieldIndex, {
                                      conditionalShowIf: {
                                        ...field.conditionalShowIf!,
                                        value: e.target.value,
                                      },
                                    })
                                  }
                                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                                  placeholder="Value"
                                />
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap justify-between gap-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => moveField(stepIndex, fieldIndex, -1)}
                                className="rounded border px-2 py-1 text-sm"
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                onClick={() => moveField(stepIndex, fieldIndex, 1)}
                                className="rounded border px-2 py-1 text-sm"
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateField(stepIndex, fieldIndex)}
                                disabled={step.fields.length >= 20}
                                className="rounded border px-2 py-1 text-sm disabled:opacity-30"
                              >
                                Duplicate
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeField(stepIndex, fieldIndex)}
                              disabled={step.fields.length <= 1}
                              className="rounded border border-red-200 px-2 py-1 text-sm text-red-600 disabled:opacity-30"
                            >
                              Delete field
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {FORM_FIELD_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addField(stepIndex, type)}
                        className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Add {FIELD_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <AnalyticsPanel analytics={analytics} loading={analyticsLoading} />

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900">Preview</h2>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </span>
            </div>
            <FormPreview steps={steps} submitLabel={submitLabel || "Submit"} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            {saveError && <p className="mb-3 text-sm text-red-500">{saveError}</p>}
            {saveOk && <p className="mb-3 text-sm text-green-600">{t("savedOk")}</p>}
            {!saveError && !saveOk && (
              <p className="mb-3 text-sm text-gray-500">
                {isDirty ? "Ready to save your latest edits." : "All changes are saved."}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !isDirty}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? t("saving") : "Save form"}
            </button>
          </div>

          {tenantSlug && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 font-semibold text-gray-900">{t("embedTitle")}</h2>
              <EmbedCode tenantSlug={tenantSlug} formSlug={form.slug} />
            </div>
          )}
        </aside>
      </form>
      <SubmissionDrawer
        submission={selectedSubmission}
        locale={locale}
        onClose={() => setSelectedSubmission(null)}
        onStatusChange={(leadId, status) => void updateSubmissionStatus(leadId, status)}
      />
    </div>
  );
}
