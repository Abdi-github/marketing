import type { FormField, FormStep } from "@marketing/ai-router";

type ValidationError = {
  field: string;
  message: string;
};

type ValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: ValidationError[] };

type StoredFormShape = {
  schema: unknown;
  steps: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function optionValues(field: FormField): Set<string> {
  return new Set((field.options ?? []).map((option) => option.value));
}

function isVisible(field: FormField, values: Record<string, unknown>): boolean {
  if (!field.conditionalShowIf) return true;
  const { field: target, op, value } = field.conditionalShowIf;
  const actual = asString(values[target]);
  if (op === "eq") return actual === value;
  if (op === "neq") return actual !== value;
  if (op === "contains") return actual.includes(value);
  return true;
}

function looksLikeSmartSteps(steps: unknown): steps is FormStep[] {
  return (
    Array.isArray(steps) &&
    steps.every(
      (step) =>
        isRecord(step) &&
        Array.isArray(step["fields"]) &&
        step["fields"].every(
          (field) =>
            isRecord(field) &&
            typeof field["name"] === "string" &&
            typeof field["type"] === "string" &&
            typeof field["label"] === "string",
        ),
    )
  );
}

function validateSmartPayload(
  payload: Record<string, unknown>,
  steps: FormStep[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const step of steps) {
    for (const field of step.fields) {
      if (!isVisible(field, payload)) continue;

      const raw = payload[field.name];
      const value = asString(raw);
      const missing = isBlank(raw);

      if (field.required) {
        if (field.type === "checkbox" && value !== "true") {
          errors.push({ field: field.name, message: `${field.label} must be accepted` });
          continue;
        }
        if (field.type !== "checkbox" && missing) {
          errors.push({ field: field.name, message: `${field.label} is required` });
          continue;
        }
      }

      if (missing) continue;

      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({ field: field.name, message: `${field.label} must be a valid email` });
        continue;
      }

      if (field.type === "number") {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          errors.push({ field: field.name, message: `${field.label} must be a number` });
          continue;
        }
        if (typeof field.min === "number" && num < field.min) {
          errors.push({
            field: field.name,
            message: `${field.label} must be at least ${field.min}`,
          });
          continue;
        }
        if (typeof field.max === "number" && num > field.max) {
          errors.push({
            field: field.name,
            message: `${field.label} must be at most ${field.max}`,
          });
          continue;
        }
        sanitized[field.name] = num;
        continue;
      }

      if ((field.type === "select" || field.type === "radio") && !optionValues(field).has(value)) {
        errors.push({ field: field.name, message: `${field.label} has an invalid option` });
        continue;
      }

      if (field.type === "checkbox") {
        sanitized[field.name] = value === "true";
        continue;
      }

      const maxLength = field.type === "textarea" ? 5000 : 500;
      if (value.length > maxLength) {
        errors.push({ field: field.name, message: `${field.label} is too long` });
        continue;
      }

      sanitized[field.name] = value;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, payload: sanitized };
}

function validateLegacyPayload(
  payload: Record<string, unknown>,
  schema: unknown,
): ValidationResult {
  const schemaObj = isRecord(schema) ? schema : {};
  const required = Array.isArray(schemaObj["required"]) ? (schemaObj["required"] as string[]) : [];
  const properties = isRecord(schemaObj["properties"])
    ? (schemaObj["properties"] as Record<string, unknown>)
    : {};
  const allowedNames = new Set([...Object.keys(properties), ...required]);
  const errors: ValidationError[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const fieldName of allowedNames) {
    const raw = payload[fieldName];
    const value = asString(raw);
    if (required.includes(fieldName) && isBlank(raw)) {
      errors.push({ field: fieldName, message: `${fieldName} is required` });
      continue;
    }
    if (isBlank(raw)) continue;
    if (fieldName.toLowerCase().includes("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({ field: fieldName, message: `${fieldName} must be a valid email` });
      continue;
    }
    if (value.length > 5000) {
      errors.push({ field: fieldName, message: `${fieldName} is too long` });
      continue;
    }
    sanitized[fieldName] = value;
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, payload: sanitized };
}

export function validateAndSanitizeFormPayload(
  payload: Record<string, unknown>,
  form: StoredFormShape,
): ValidationResult {
  if (looksLikeSmartSteps(form.steps)) {
    return validateSmartPayload(payload, form.steps);
  }
  return validateLegacyPayload(payload, form.schema);
}
