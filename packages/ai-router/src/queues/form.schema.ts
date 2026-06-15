import { z } from "zod";

// ─── Field types ───────────────────────────────────────────────────────────────
export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "number",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

// ─── Conditional logic ─────────────────────────────────────────────────────────
// Evaluated client-side: field is shown only when condition passes.
export const conditionalShowIfSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "neq", "contains"]),
  value: z.string(),
});
export type ConditionalShowIf = z.infer<typeof conditionalShowIfSchema>;

// ─── Form field ────────────────────────────────────────────────────────────────
export const formFieldSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(FORM_FIELD_TYPES),
  label: z.string().min(1).max(120),
  placeholder: z.string().max(120).optional(),
  required: z.boolean().default(false),
  /** Options for select/radio/checkbox fields */
  options: z
    .array(
      z.object({
        label: z.string().max(120),
        value: z.string().max(80),
      }),
    )
    .optional(),
  /** For number fields */
  min: z.number().optional(),
  max: z.number().optional(),
  /** Conditional rendering: show only when another field matches */
  conditionalShowIf: conditionalShowIfSchema.optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

// ─── Form step ────────────────────────────────────────────────────────────────
// If the form has `steps`, each step is rendered as a screen.
// If `steps` is null/absent on the DB row the form uses the legacy `schema` column.
export const formStepSchema = z.object({
  title: z.string().max(120).optional(),
  fields: z.array(formFieldSchema).min(1).max(20),
});
export type FormStep = z.infer<typeof formStepSchema>;

// ─── Settings ─────────────────────────────────────────────────────────────────
export const formSettingsSchema = z.object({
  honeypot: z.boolean().default(true),
  turnstile_enabled: z.boolean().default(false),
  success_message: z.string().max(300).optional(),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

// ─── Smart form (complete) ────────────────────────────────────────────────────
export const smartFormSchema = z.object({
  steps: z.array(formStepSchema).min(1).max(5),
  settings: formSettingsSchema.default({ honeypot: true, turnstile_enabled: false }),
  submitLabel: z.string().max(80).optional(),
});
export type SmartForm = z.infer<typeof smartFormSchema>;

// ─── AI builder output ────────────────────────────────────────────────────────
// Tool call output from form-builder-v1 prompt.
// Same as smartFormSchema but the tool may return fewer defaults.
export const aiBuildFormOutputSchema = smartFormSchema;
export type AIBuildFormOutput = SmartForm;

// ─── Queue job (if we ever queue form-generation) ─────────────────────────────
export const FORM_BUILDER_QUEUE_NAME = "form-builder" as const;
