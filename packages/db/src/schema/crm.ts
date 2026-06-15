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

// ─── contact_lifecycle_stage enum ────────────────────────────────────────────
// Conventional B2B/B2C funnel stages. `lead` is the default on creation; the
// behavioral-scoring worker (step-25) and sequence triggers (step-26) advance
// contacts through the funnel.
export const contactLifecycleStageEnum = pgEnum("contact_lifecycle_stage", [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "customer",
  "evangelist",
]);

// ─── contacts ─────────────────────────────────────────────────────────────────
// One deduplicated row per person per tenant. Created by the lead-dedup pipeline
// (form submission API) or manually by a tenant user.
// Unique on (tenant_id, email) — the dedup key.
// add-tenant-table: tenant_id NOT NULL + index + RLS in migration.
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    /** Simple label array — MVP "segments" are just tag filters on this column. */
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    /** How this contact first entered the CRM. */
    source: text("source").notNull().default("form"),
    /** Funnel stage. Advanced by step-25 scoring + step-26 sequences. */
    lifecycleStage: contactLifecycleStageEnum("lifecycle_stage").notNull().default("lead"),
    /** Extensible per-tenant fields (no schema migration to add a property). */
    customProperties: jsonb("custom_properties").notNull().default({}),
    /** AI-computed engagement score 0-100. Populated by step-25 worker. */
    leadScore: integer("lead_score").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contacts_tenant_id_idx").on(t.tenantId),
    uniqueIndex("contacts_tenant_email_unique").on(t.tenantId, t.email),
    index("contacts_lifecycle_stage_idx").on(t.tenantId, t.lifecycleStage),
    index("contacts_lead_score_idx").on(t.tenantId, t.leadScore),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactLifecycleStage = (typeof contactLifecycleStageEnum.enumValues)[number];
