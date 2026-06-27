"use client";

// Embeddable lead-capture form widget.
// Rendered on public landing pages (/p/<tenantSlug>/<pageSlug>).
// Submits to POST /api/forms/<tenantSlug>/<formSlug> — no auth required.
//
// Modes:
//  • Smart form: `steps` prop provided — multi-step with conditional logic
//  • Legacy: `steps` absent — derives fields from JSON `schema`
import React, { useEffect, useRef, useState } from "react";
import type { FormField, FormStep, FormSettings } from "@marketing/ai-router/form-schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  tenantSlug: string;
  formSlug: string;
  /** Legacy flat JSON schema (used when steps is absent). */
  schema?: Record<string, unknown>;
  /** Smart form steps. When present, overrides schema. */
  steps?: FormStep[];
  settings?: Partial<FormSettings>;
  submitLabel?: string;
};

type LegacyFieldDef = {
  name: string;
  label: string;
  type: "text" | "email" | "tel";
  required: boolean;
};

// ─── Legacy field derivation ───────────────────────────────────────────────────

function deriveLegacyFields(schema: Record<string, unknown>): LegacyFieldDef[] {
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
        : "text") as LegacyFieldDef["type"],
    required: required.includes(name),
  }));

  if (fields.length === 0) {
    return [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "E-Mail", type: "email", required: true },
    ];
  }
  return fields;
}

// ─── Conditional logic evaluator ──────────────────────────────────────────────

function isVisible(field: FormField, values: Record<string, string>): boolean {
  if (!field.conditionalShowIf) return true;
  const { field: target, op, value } = field.conditionalShowIf;
  const actual = values[target] ?? "";
  if (op === "eq") return actual === value;
  if (op === "neq") return actual !== value;
  if (op === "contains") return actual.includes(value);
  return true;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function validateField(field: FormField, value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  if (field.required) {
    if (field.type === "checkbox" && trimmed !== "true") {
      return `${field.label} must be accepted.`;
    }
    if (field.type !== "checkbox" && isBlank(value)) {
      return `Please complete ${field.label}.`;
    }
  }

  if (isBlank(value)) return null;

  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `Please enter a valid email address for ${field.label}.`;
  }

  if (field.type === "number") {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return `${field.label} must be a number.`;
    if (typeof field.min === "number" && num < field.min) {
      return `${field.label} must be at least ${field.min}.`;
    }
    if (typeof field.max === "number" && num > field.max) {
      return `${field.label} must be at most ${field.max}.`;
    }
  }

  if ((field.type === "select" || field.type === "radio") && field.options?.length) {
    const allowed = new Set(field.options.map((option) => option.value));
    if (!allowed.has(trimmed)) return `Please choose a valid option for ${field.label}.`;
  }

  return null;
}

function validateVisibleFields(fields: FormField[], values: Record<string, string>): string | null {
  for (const field of fields) {
    const error = validateField(field, values[field.name]);
    if (error) return error;
  }
  return null;
}

// ─── Individual field renderer ────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--lp-border,#d1d5db)",
  borderRadius: 6,
  fontSize: "0.9rem",
  width: "100%",
  boxSizing: "border-box",
};

function inputTypeFor(field: FormField): React.HTMLInputTypeAttribute {
  if (field.type === "email") return "email";
  if (field.type === "tel") return "tel";
  if (field.type === "number") return "number";
  return "text";
}

function placeholderFor(field: FormField): string | undefined {
  if (field.placeholder) return field.placeholder;
  const name = field.name.toLowerCase();
  const label = field.label.toLowerCase();
  if (name.includes("date") || label.includes("date")) return "YYYY-MM-DD or DD-MM-YYYY";
  if (name.includes("time") || label.includes("time")) return "HH:MM";
  return undefined;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `lf-${field.name}`;

  if (field.type === "textarea") {
    return (
      <textarea
        id={id}
        name={field.name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        placeholder={field.placeholder}
        rows={4}
        style={{ ...inputStyle, resize: "vertical" }}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        id={id}
        name={field.name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        style={inputStyle}
      >
        <option value="">—</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "radio") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {(field.options ?? []).map((opt) => (
          <label
            key={opt.value}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
          >
            <input
              type="radio"
              name={field.name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              required={field.required}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          name={field.name}
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        />
        {field.placeholder ?? field.label}
      </label>
    );
  }

  return (
    <input
      id={id}
      type={inputTypeFor(field)}
      name={field.name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      placeholder={placeholderFor(field)}
      min={field.min}
      max={field.max}
      style={inputStyle}
    />
  );
}

// ─── Turnstile loader ─────────────────────────────────────────────────────────

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Load the Turnstile script once
    if (!document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }

    const tryRender = () => {
      const w = (
        window as unknown as { turnstile?: { render: (el: HTMLElement, opts: unknown) => string } }
      ).turnstile;
      if (w && containerRef.current && !widgetIdRef.current) {
        widgetIdRef.current = w.render(containerRef.current, {
          sitekey: siteKey,
          callback: onToken,
        });
      } else {
        setTimeout(tryRender, 300);
      }
    };

    tryRender();
  }, [siteKey, onToken]);

  return <div ref={containerRef} style={{ marginTop: "0.5rem" }} />;
}

// ─── Smart form (multi-step) ──────────────────────────────────────────────────

function SmartFormBody({
  formSlug,
  steps,
  settings,
  submitLabel,
  onSubmit,
  onStart,
  onStepView,
  onStepComplete,
  submitting,
  error,
}: {
  formSlug: string;
  steps: FormStep[];
  settings: Partial<FormSettings>;
  submitLabel?: string;
  onSubmit: (payload: Record<string, string>, turnstileToken?: string) => Promise<void>;
  onStart: (fieldName: string) => void;
  onStepView: (stepIndex: number, stepTitle?: string) => void;
  onStepComplete: (stepIndex: number, stepTitle?: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);

  const siteKey =
    typeof process !== "undefined" ? (process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] ?? "") : "";
  const showTurnstile = settings.turnstile_enabled === true && siteKey !== "";

  const currentStep = steps[stepIndex]!;
  const visibleFields = currentStep.fields.filter((f) => isVisible(f, values));
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    onStepView(stepIndex, currentStep.title);
  }, [currentStep.title, onStepView, stepIndex]);

  function setValue(name: string, val: string) {
    onStart(name);
    setValidationError(null);
    setValues((prev) => ({ ...prev, [name]: val }));
  }

  function handleNext(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const visibleError = validateVisibleFields(visibleFields, values);
    if (visibleError) {
      setValidationError(visibleError);
      return;
    }
    setValidationError(null);

    if (!isLastStep) {
      onStepComplete(stepIndex, currentStep.title);
      setStepIndex((i) => i + 1);
    } else {
      void onSubmit(values, showTurnstile ? turnstileToken : undefined);
    }
  }

  return (
    <form
      data-form-slug={formSlug}
      data-form-kind="smart"
      noValidate
      onSubmit={handleNext}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      {steps.length > 1 && (
        <div style={{ fontSize: "0.8rem", color: "var(--lp-muted,#6b7280)" }}>
          Step {stepIndex + 1} / {steps.length}
        </div>
      )}

      {currentStep.title && (
        <h4 style={{ margin: "0 0 0.25rem", fontWeight: 600, color: "var(--lp-text,#111827)" }}>
          {currentStep.title}
        </h4>
      )}

      {visibleFields.map((field) => (
        <label
          key={field.name}
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          {field.type !== "checkbox" && (
            <span
              style={{ fontWeight: 500, fontSize: "0.9rem", color: "var(--lp-text-soft,#374151)" }}
            >
              {field.label}
              {field.required && <span style={{ color: "#ef4444" }}> *</span>}
            </span>
          )}
          <FieldInput
            field={field}
            value={values[field.name] ?? ""}
            onChange={(v) => setValue(field.name, v)}
          />
        </label>
      ))}

      {isLastStep && showTurnstile && (
        <TurnstileWidget siteKey={siteKey} onToken={setTurnstileToken} />
      )}

      {(validationError || error) && (
        <p aria-live="polite" style={{ color: "#ef4444", fontSize: "0.85rem", margin: 0 }}>
          {validationError ?? error}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex((i) => i - 1)}
            style={{
              padding: "0.6rem 1.2rem",
              background: "var(--lp-subtle,#f3f4f6)",
              color: "var(--lp-text-soft,#374151)",
              border: "1px solid var(--lp-border,#d1d5db)",
              borderRadius: 6,
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || (isLastStep && showTurnstile && !turnstileToken)}
          style={{
            padding: "0.6rem 1.5rem",
            background: submitting ? "var(--lp-muted,#9ca3af)" : "var(--brand-primary,#3b82f6)",
            color: "var(--lp-on-primary,#fff)",
            border: "none",
            borderRadius: 6,
            fontSize: "0.9rem",
            cursor:
              submitting || (isLastStep && showTurnstile && !turnstileToken)
                ? "not-allowed"
                : "pointer",
          }}
        >
          {submitting ? "Sending…" : isLastStep ? (submitLabel ?? "Submit") : "Next"}
        </button>
      </div>
    </form>
  );
}

// ─── Legacy single-step form ───────────────────────────────────────────────────

function LegacyFormBody({
  formSlug,
  schema,
  submitLabel,
  onSubmit,
  onStart,
  submitting,
  error,
}: {
  formSlug: string;
  schema: Record<string, unknown>;
  submitLabel?: string;
  onSubmit: (payload: Record<string, string>) => Promise<void>;
  onStart: (fieldName: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const fields = deriveLegacyFields(schema);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, ""])),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function validateLegacyFields(): string | null {
    for (const field of fields) {
      const value = values[field.name]?.trim() ?? "";
      if (field.required && value === "") return `Please complete ${field.label}.`;
      if (field.type === "email" && value !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return `Please enter a valid email address for ${field.label}.`;
      }
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const visibleError = validateLegacyFields();
    if (visibleError) {
      setValidationError(visibleError);
      return;
    }
    setValidationError(null);
    void onSubmit(values);
  }

  return (
    <form
      data-form-slug={formSlug}
      data-form-kind="legacy"
      noValidate
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      {fields.map((field) => (
        <label
          key={field.name}
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          <span
            style={{ fontWeight: 500, fontSize: "0.9rem", color: "var(--lp-text-soft,#374151)" }}
          >
            {field.label}
            {field.required && <span style={{ color: "#ef4444" }}> *</span>}
          </span>
          <input
            type={field.type}
            name={field.name}
            value={values[field.name] ?? ""}
            onChange={(e) => {
              onStart(field.name);
              setValidationError(null);
              setValues((v) => ({ ...v, [field.name]: e.target.value }));
            }}
            required={field.required}
            style={inputStyle}
          />
        </label>
      ))}

      {(validationError || error) && (
        <p aria-live="polite" style={{ color: "#ef4444", fontSize: "0.85rem", margin: 0 }}>
          {validationError ?? error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "0.6rem 1.5rem",
          background: submitting ? "var(--lp-muted,#9ca3af)" : "var(--brand-primary,#3b82f6)",
          color: "var(--lp-on-primary,#fff)",
          border: "none",
          borderRadius: 6,
          fontSize: "0.9rem",
          cursor: submitting ? "not-allowed" : "pointer",
          alignSelf: "flex-start",
        }}
      >
        {submitting ? "Sending…" : (submitLabel ?? "Submit")}
      </button>
    </form>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function LeadForm({
  tenantSlug,
  formSlug,
  schema = {},
  steps,
  settings,
  submitLabel,
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const successMessage = settings?.success_message ?? "Thank you! We'll be in touch soon.";
  const honeypotEnabled = settings?.honeypot !== false;

  // Honeypot ref — read at submit time (not tracked in state to stay invisible to React)
  const honeypotRef = useRef<HTMLInputElement>(null);

  function dispatchFormEvent(
    type: "__form_start" | "__form_step_view" | "__form_step_complete" | "__form_submit",
    detail: Record<string, unknown>,
  ) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(type, { detail: { formSlug, ...detail } }));
  }

  function handleStart(fieldName: string) {
    if (startedRef.current) return;
    startedRef.current = true;
    dispatchFormEvent("__form_start", { fieldName });
  }

  async function handleSubmit(payload: Record<string, string>, turnstileToken?: string) {
    setSubmitting(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25_000);

    try {
      const body: Record<string, unknown> = { ...payload };
      if (honeypotEnabled) body["__hp"] = "";
      if (turnstileToken) body["__cf_turnstile"] = turnstileToken;

      const res = await fetch(`/api/forms/${tenantSlug}/${formSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        throw new Error((resBody as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      setSubmitted(true);
      // Notify track.js for A/B experiment conversion counting.
      dispatchFormEvent("__form_submit", {});
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("This is taking longer than expected. Please try again in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Error sending. Please try again.");
      }
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p
        style={{
          padding: "0.75rem 1rem",
          background: "#dcfce7",
          borderRadius: 6,
          color: "#166534",
          fontWeight: 500,
        }}
      >
        {successMessage}
      </p>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Honeypot — visually hidden, filled only by bots */}
      {honeypotEnabled && (
        <input
          ref={honeypotRef}
          name="__hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />
      )}

      {steps && steps.length > 0 ? (
        <SmartFormBody
          formSlug={formSlug}
          steps={steps}
          settings={settings ?? {}}
          submitLabel={submitLabel}
          onSubmit={handleSubmit}
          onStart={handleStart}
          onStepView={(stepIndex, stepTitle) =>
            dispatchFormEvent("__form_step_view", { stepIndex, stepTitle })
          }
          onStepComplete={(stepIndex, stepTitle) =>
            dispatchFormEvent("__form_step_complete", { stepIndex, stepTitle })
          }
          submitting={submitting}
          error={error}
        />
      ) : (
        <LegacyFormBody
          formSlug={formSlug}
          schema={schema}
          submitLabel={submitLabel}
          onSubmit={handleSubmit}
          onStart={handleStart}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  );
}
