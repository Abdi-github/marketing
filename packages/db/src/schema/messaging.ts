import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./crm";
import { leads } from "./landing-pages";
import { tenants } from "./tenants";

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const messageChannelEnum = pgEnum("message_channel", ["email", "sms", "whatsapp"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "read",
]);
export const waTemplateStatusEnum = pgEnum("wa_template_status", [
  "pending",
  "approved",
  "rejected",
]);
export const smsPhoneVerificationStatusEnum = pgEnum("sms_phone_verification_status", [
  "pending",
  "verified",
  "expired",
  "failed",
]);

// ─── whatsapp_templates ────────────────────────────────────────────────────────

export const whatsappTemplates = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull().default("de"),
    body: text("body").notNull(),
    status: waTemplateStatusEnum("status").notNull().default("pending"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("whatsapp_templates_tenant_idx").on(t.tenantId)],
);

export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;

// ─── messages (unified inbox) ─────────────────────────────────────────────────

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    channel: messageChannelEnum("channel").notNull(),
    direction: messageDirectionEnum("direction").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("text"),
    meta: jsonb("meta").notNull().default({}),
    status: messageStatusEnum("status").notNull().default("queued"),
    policyState: text("policy_state"),
    errorMessage: text("error_message"),
    externalId: text("external_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_tenant_idx").on(t.tenantId),
    index("messages_contact_idx").on(t.contactId),
    index("messages_tenant_time_idx").on(t.tenantId, t.occurredAt),
  ],
);

export type Message = typeof messages.$inferSelect;

export const smsTemplates = pgTable(
  "sms_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body").notNull(),
    locale: text("locale").notNull().default("en"),
    category: text("category").notNull().default("custom"),
    presetKey: text("preset_key"),
    isTransactional: boolean("is_transactional").notNull().default(false),
    aiDraftedAt: timestamp("ai_drafted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sms_templates_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const smsSequences = pgTable(
  "sms_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    triggerEvent: text("trigger_event").notNull().default("manual"),
    triggerFilter: jsonb("trigger_filter")
      .notNull()
      .$default(() => ({})),
    status: text("status").notNull().default("paused"),
    category: text("category").notNull().default("custom"),
    presetKey: text("preset_key"),
    steps: jsonb("steps")
      .notNull()
      .$default(() => []),
    dailyCap: integer("daily_cap").notNull().default(100),
    quietHoursStart: text("quiet_hours_start").notNull().default("20:00"),
    quietHoursEnd: text("quiet_hours_end").notNull().default("08:00"),
    timezone: text("timezone").notNull().default("Europe/Zurich"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sms_sequences_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const smsSequenceEnrollments = pgTable(
  "sms_sequence_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => smsSequences.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    currentStep: integer("current_step").notNull().default(0),
    status: text("status").notNull().default("enrolled"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("sms_sequence_enrollment_unique").on(t.sequenceId, t.contactId),
    index("sms_sequence_enrollments_tenant_idx").on(t.tenantId),
    index("sms_sequence_enrollments_due_idx").on(t.status, t.nextRunAt),
  ],
);

export const smsPreferences = pgTable(
  "sms_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    phone: text("phone").notNull(),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("system"),
    consentSourceUrl: text("consent_source_url"),
    consentCapturedAt: timestamp("consent_captured_at", { withTimezone: true }),
    consentMeta: jsonb("consent_meta")
      .notNull()
      .$default(() => ({})),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sms_preferences_tenant_phone_unique").on(t.tenantId, t.phone),
    index("sms_preferences_tenant_contact_idx").on(t.tenantId, t.contactId),
  ],
);

export const smsAutomationJobs = pgTable(
  "sms_automation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    input: jsonb("input")
      .notNull()
      .$default(() => ({})),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    costBudgetCents: integer("cost_budget_cents").notNull().default(30),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sms_automation_jobs_idempotency_unique").on(t.tenantId, t.idempotencyKey),
    index("sms_automation_jobs_tenant_idx").on(t.tenantId, t.createdAt),
  ],
);

export const smsPhoneVerifications = pgTable(
  "sms_phone_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    status: smsPhoneVerificationStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    resendCount: integer("resend_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sms_phone_verifications_tenant_idx").on(t.tenantId, t.createdAt),
    index("sms_phone_verifications_phone_idx").on(t.tenantId, t.phone),
  ],
);

export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type SmsSequence = typeof smsSequences.$inferSelect;
export type SmsSequenceEnrollment = typeof smsSequenceEnrollments.$inferSelect;
export type SmsPreference = typeof smsPreferences.$inferSelect;
export type SmsAutomationJob = typeof smsAutomationJobs.$inferSelect;
export type SmsPhoneVerification = typeof smsPhoneVerifications.$inferSelect;

export interface SmsSequenceStep {
  delay_minutes: number;
  template_id: string;
  purpose: "transactional" | "marketing";
}

export interface SmsSequenceTriggerFilter {
  leadKind?: "booking" | "callback" | "quote" | "generic";
  sourceChannel?: string;
  formId?: string;
  landingPageId?: string;
  workflowState?: string;
  requireSmsConsent?: boolean;
}
