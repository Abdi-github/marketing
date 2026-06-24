import { z } from "zod";

export const emailAutomationKindSchema = z.enum([
  "template_draft",
  "sequence_suggest",
  "complete_automation",
]);

export const emailAutomationIntentSchema = z.enum([
  "booking",
  "callback",
  "quote",
  "generic",
  "restaurant_reservation",
  "restaurant_event",
]);

export const emailAutomationJobSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  kind: emailAutomationKindSchema,
  locale: z.string().default("de-CH"),
  businessName: z.string().min(1).max(200),
  vertical: z.string().min(2).max(100),
  city: z.string().max(100).optional(),
  purpose: z.string().min(3).max(600),
  tone: z.string().max(120).optional(),
  triggerEvent: z
    .enum(["lead.captured", "contact.score_changed", "contact.lifecycle_changed", "manual"])
    .default("lead.captured"),
  intent: emailAutomationIntentSchema.default("generic"),
  costBudgetCents: z.number().int().positive().default(50),
  promptId: z.string().default("email-automation-complete-v1"),
  promptVersion: z.number().int().positive().default(1),
});

export type EmailAutomationJob = z.infer<typeof emailAutomationJobSchema>;
export type EmailAutomationKind = z.infer<typeof emailAutomationKindSchema>;
export type EmailAutomationIntent = z.infer<typeof emailAutomationIntentSchema>;

export const EMAIL_AUTOMATION_QUEUE_NAME = "ai.email_automation.generate" as const;
