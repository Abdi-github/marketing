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
import { tenants } from "./tenants";

// ─── email_templates ─────────────────────────────────────────────────────────
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    locale: text("locale").notNull().default("de-CH"),
    presetKey: text("preset_key"),
    category: text("category").notNull().default("custom"),
    aiDraftedAt: timestamp("ai_drafted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_templates_tenant_id_idx").on(t.tenantId)],
);

// ─── email_sequence_trigger enum ─────────────────────────────────────────────
export const emailSequenceTriggerEnum = pgEnum("email_sequence_trigger", [
  "lead.captured",
  "contact.score_changed",
  "contact.lifecycle_changed",
  "manual",
]);

// ─── email_sequences ──────────────────────────────────────────────────────────
// steps JSONB: Array<{ delay_minutes: number; template_id: string }>
// trigger_filter JSONB: see SequenceTriggerFilter type below
export const emailSequences = pgTable(
  "email_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    triggerEvent: emailSequenceTriggerEnum("trigger_event").notNull().default("manual"),
    triggerFilter: jsonb("trigger_filter")
      .notNull()
      .$default(() => ({})),
    status: text("status").notNull().default("active"),
    presetKey: text("preset_key"),
    category: text("category").notNull().default("custom"),
    steps: jsonb("steps")
      .notNull()
      .$default(() => []),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_sequences_tenant_id_idx").on(t.tenantId)],
);

// ─── email_sequence_enrollments ───────────────────────────────────────────────
export const emailSequenceEnrollments = pgTable(
  "email_sequence_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => emailSequences.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").notNull().default(0),
    status: text("status").notNull().default("enrolled"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("email_seq_enroll_uniq").on(t.sequenceId, t.contactId),
    index("email_seq_enroll_tick_idx").on(t.status, t.nextRunAt),
    index("email_seq_enroll_tenant_idx").on(t.tenantId),
  ],
);

// ─── email_sends ──────────────────────────────────────────────────────────────
export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id").references(() => emailSequenceEnrollments.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "restrict" }),
    sendKind: text("send_kind").notNull().default("sequence_step"),
    resendMessageId: text("resend_message_id"),
    status: text("status").notNull().default("queued"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_sends_tenant_id_idx").on(t.tenantId),
    index("email_sends_contact_id_idx").on(t.contactId),
    index("email_sends_resend_msg_id_idx").on(t.resendMessageId),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────
// Email-level suppression list. Kept by email address, not only contact_id, so
// bounce/complaint/unsubscribe state survives contact deletion and re-creation.
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("system"),
    resendEventType: text("resend_event_type"),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_suppressions_tenant_id_idx").on(t.tenantId),
    index("email_suppressions_contact_id_idx").on(t.tenantId, t.contactId),
    uniqueIndex("email_suppressions_tenant_email_unique").on(t.tenantId, t.email),
  ],
);

export const emailPreferences = pgTable(
  "email_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(true),
    source: text("source").notNull().default("system"),
    locale: text("locale"),
    updatedFromIp: text("updated_from_ip"),
    updatedFromUserAgent: text("updated_from_user_agent"),
    consentSourceUrl: text("consent_source_url"),
    consentCapturedAt: timestamp("consent_captured_at", { withTimezone: true }),
    consentMeta: jsonb("consent_meta")
      .notNull()
      .$default(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_preferences_tenant_id_idx").on(t.tenantId),
    index("email_preferences_contact_id_idx").on(t.tenantId, t.contactId),
    uniqueIndex("email_preferences_tenant_email_unique").on(t.tenantId, t.email),
  ],
);

export const emailAutomationJobs = pgTable(
  "email_automation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    jobKind: text("job_kind").notNull(),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    input: jsonb("input")
      .notNull()
      .$default(() => ({})),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    costBudgetCents: integer("cost_budget_cents").notNull().default(50),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_automation_jobs_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("email_automation_jobs_idempotency_unique").on(t.tenantId, t.idempotencyKey),
  ],
);

export const emailSendingDomains = pgTable(
  "email_sending_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    status: text("status").notNull().default("pending_verification"),
    verifyToken: text("verify_token").notNull(),
    fromName: text("from_name").notNull().default("MarketingAI CH"),
    fromLocalPart: text("from_local_part").notNull().default("hello"),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastDnsCheckAt: timestamp("last_dns_check_at", { withTimezone: true }),
    lastDnsCheckError: text("last_dns_check_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_sending_domains_tenant_id_idx").on(t.tenantId),
    uniqueIndex("email_sending_domains_domain_unique").on(t.domain),
    index("email_sending_domains_tenant_primary_idx").on(t.tenantId, t.isPrimary),
  ],
);

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type NewEmailSequence = typeof emailSequences.$inferInsert;
export type EmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferSelect;
export type NewEmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferInsert;
export type EmailSend = typeof emailSends.$inferSelect;
export type NewEmailSend = typeof emailSends.$inferInsert;
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;
export type EmailPreference = typeof emailPreferences.$inferSelect;
export type NewEmailPreference = typeof emailPreferences.$inferInsert;
export type EmailSendingDomain = typeof emailSendingDomains.$inferSelect;
export type NewEmailSendingDomain = typeof emailSendingDomains.$inferInsert;
export type EmailAutomationJob = typeof emailAutomationJobs.$inferSelect;
export type NewEmailAutomationJob = typeof emailAutomationJobs.$inferInsert;
export type EmailSequenceTrigger = (typeof emailSequenceTriggerEnum.enumValues)[number];

export interface SequenceStep {
  delay_minutes: number;
  template_id: string;
}

export interface SequenceTriggerFilter {
  lifecycle_stage?: string;
  min_delta?: number;
  min_score?: number;
  leadKind?: "booking" | "callback" | "quote" | "generic";
  sourceChannel?: string;
  formId?: string;
  landingPageId?: string;
  requireMarketingConsent?: boolean;
}
