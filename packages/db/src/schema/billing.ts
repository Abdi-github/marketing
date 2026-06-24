import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── stripe_customers ─────────────────────────────────────────────────────────
// One Stripe customer per tenant. Created on first checkout attempt.
// tenant_id is both PK and FK — enforces one-to-one with tenants.
export const stripeCustomers = pgTable("stripe_customers", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── subscription_status enum ─────────────────────────────────────────────────
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
]);

// ─── subscriptions ────────────────────────────────────────────────────────────
// Latest subscription per tenant. Upserted on each Stripe webhook.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    plan: text("plan").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }).notNull(),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_tenant_id_idx").on(t.tenantId)],
);

// ─── usage_records ────────────────────────────────────────────────────────────
// Append-only billing ledger. Batched and pushed to Stripe metered usage hourly.
export const usageMetricEnum = pgEnum("usage_metric", [
  "ai_tokens_in",
  "ai_tokens_out",
  "ai_cost_cents",
  "storage_bytes",
  "sms_sent",
  "sms_segments",
]);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metric: usageMetricEnum("metric").notNull(),
    quantity: integer("quantity").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    pushedToStripeAt: timestamp("pushed_to_stripe_at", { withTimezone: true }),
  },
  (t) => [index("usage_records_tenant_id_idx").on(t.tenantId)],
);

// ─── invoices ─────────────────────────────────────────────────────────────────
// Cached from Stripe for dashboard display. Not the source of truth.
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("chf"),
    status: text("status").notNull(),
    pdfUrl: text("pdf_url"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_tenant_id_idx").on(t.tenantId)],
);

// ─── webhook_events ───────────────────────────────────────────────────────────
// Idempotency log for all incoming webhook events (Stripe and future providers).
// UNIQUE(provider, event_id) is the idempotency key — insert first, process second.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    /** HMAC signature header value from the provider (stored for audit). Added in migration 0005. */
    signature: text("signature"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_id_unique").on(t.provider, t.eventId),
    index("webhook_events_tenant_id_idx").on(t.tenantId),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────
export type StripeCustomer = typeof stripeCustomers.$inferSelect;
export type NewStripeCustomer = typeof stripeCustomers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
