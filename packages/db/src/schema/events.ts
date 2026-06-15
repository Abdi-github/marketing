import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { contacts } from "./crm";

// ─── event_type enum ───────────────────────────────────────────────────────────
export const eventTypeEnum = pgEnum("event_type", [
  "page_view",
  "scroll_50",
  "scroll_90",
  "time_30s",
  "form_view",
  "form_start",
  "form_step_view",
  "form_step_complete",
  "form_abandon",
  "cta_click",
  "email_open",
  "email_click",
  "form_submit",
]);

// ─── events ───────────────────────────────────────────────────────────────────
// Append-only. Partitioned by occurred_at month in Postgres; Drizzle sees a
// single logical table. The partition maintenance cron creates new monthly
// partitions and drops partitions older than 18 months (ADR-0022).
// FADP compliance: no IP stored; country_code derived from CF-IPCountry header.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Null for anonymous visitors before a form submission links them. */
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** First-party UUID cookie (__tid). Never tied to a real-world identity. */
    anonymousId: text("anonymous_id").notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    properties: jsonb("properties").notNull().default({}),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    /** ISO-3166-1 alpha-2 from Cloudflare CF-IPCountry header. Never store raw IP. */
    countryCode: text("country_code"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_tenant_id_idx").on(t.tenantId),
    index("events_contact_id_idx").on(t.contactId),
    index("events_anonymous_id_idx").on(t.anonymousId),
    index("events_occurred_at_idx").on(t.occurredAt),
  ],
);

// ─── contact_score_history ─────────────────────────────────────────────────────
// Immutable. One row per scoring run that produces a delta > 0.
// Used to render the score sparkline on the contact detail panel.
export const contactScoreHistory = pgTable(
  "contact_score_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    previousScore: integer("previous_score").notNull().default(0),
    reasoning: text("reasoning"),
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contact_score_history_contact_id_idx").on(t.contactId, t.scoredAt),
    index("contact_score_history_tenant_id_idx").on(t.tenantId),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventType = (typeof eventTypeEnum.enumValues)[number];
export type ContactScoreHistory = typeof contactScoreHistory.$inferSelect;
export type NewContactScoreHistory = typeof contactScoreHistory.$inferInsert;
