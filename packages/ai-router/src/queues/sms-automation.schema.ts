import { z } from "zod";

export const smsSendPurposeSchema = z.enum([
  "transactional_acknowledgement",
  "manual_reply",
  "sequence_transactional",
  "sequence_marketing",
  "integration_test",
]);

export const smsSendJobSchema = z.object({
  tenantId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const smsSequenceTriggerJobSchema = z.object({
  tenantId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventType: z.enum(["lead.captured", "reservation.status_changed", "manual"]),
  sequenceId: z.string().uuid().optional(),
  contactId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  payload: z.record(z.unknown()).default({}),
});

export const smsAutomationJobSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  locale: z.string().default("en"),
  businessName: z.string().min(1).max(200),
  vertical: z.string().min(2).max(100),
  city: z.string().max(100).optional(),
  purpose: z.string().min(3).max(600),
  intent: z.enum(["booking", "callback", "quote", "generic"]).default("booking"),
  costBudgetCents: z.number().int().positive().default(30),
  promptId: z.string().default("sms-automation-complete-v1"),
  promptVersion: z.number().int().positive().default(1),
});

export type SmsSendPurpose = z.infer<typeof smsSendPurposeSchema>;
export type SmsSendJob = z.infer<typeof smsSendJobSchema>;
export type SmsSequenceTriggerJob = z.infer<typeof smsSequenceTriggerJobSchema>;
export type SmsAutomationJob = z.infer<typeof smsAutomationJobSchema>;

export const SMS_SEND_QUEUE_NAME = "messaging.sms.send" as const;
export const SMS_SEQUENCE_TRIGGER_QUEUE_NAME = "messaging.sms.sequence-trigger" as const;
export const SMS_SEQUENCE_TICK_QUEUE_NAME = "messaging.sms.sequence-tick" as const;
export const SMS_WEBHOOK_QUEUE_NAME = "integrations.twilio.sms-webhook" as const;
export const SMS_AUTOMATION_QUEUE_NAME = "ai.sms_automation.generate" as const;
