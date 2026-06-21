import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./crm";

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const messageChannelEnum = pgEnum("message_channel", ["email", "sms", "whatsapp"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "read",
]);
export const waTemplateStatusEnum = pgEnum("wa_template_status", [
  "pending",
  "approved",
  "rejected",
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
