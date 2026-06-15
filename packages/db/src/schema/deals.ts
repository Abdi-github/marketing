import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./crm";
import { tenants } from "./tenants";

// ─── deal_stages ──────────────────────────────────────────────────────────────
export const dealStages = pgTable(
  "deal_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    order: integer("order").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("deal_stages_tenant_key_uniq").on(t.tenantId, t.key),
    index("deal_stages_tenant_id_idx").on(t.tenantId),
  ],
);

// ─── deals ────────────────────────────────────────────────────────────────────
// amountChf: integer in whole CHF (no rappen). Swiss SMEs think in full francs.
// aiSummary: written by the deal-summarize nightly worker for stale open deals.
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => dealStages.id),
    title: text("title").notNull(),
    amountChf: integer("amount_chf").notNull().default(0),
    expectedCloseDate: date("expected_close_date"),
    aiSummary: text("ai_summary"),
    status: text("status").notNull().default("open"),
    wonAt: timestamp("won_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deals_tenant_id_idx").on(t.tenantId),
    index("deals_stage_id_idx").on(t.stageId),
    index("deals_contact_id_idx").on(t.contactId),
    index("deals_status_idx").on(t.tenantId, t.status),
  ],
);

// ─── deal_activities ──────────────────────────────────────────────────────────
export const dealActivities = pgTable(
  "deal_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deal_activities_deal_id_idx").on(t.dealId),
    index("deal_activities_tenant_id_idx").on(t.tenantId),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────
export type DealStage = typeof dealStages.$inferSelect;
export type NewDealStage = typeof dealStages.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealActivity = typeof dealActivities.$inferSelect;
export type NewDealActivity = typeof dealActivities.$inferInsert;

// Default stages seeded per tenant on first use.
export const DEFAULT_DEAL_STAGES: Array<{
  key: string;
  label: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}> = [
  { key: "inquiry", label: "Inquiry", order: 0, isWon: false, isLost: false },
  { key: "qualified", label: "Qualified", order: 1, isWon: false, isLost: false },
  { key: "proposal", label: "Proposal", order: 2, isWon: false, isLost: false },
  { key: "won", label: "Won", order: 3, isWon: true, isLost: false },
  { key: "lost", label: "Lost", order: 4, isWon: false, isLost: true },
];
