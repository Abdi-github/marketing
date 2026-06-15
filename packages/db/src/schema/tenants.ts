import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ─── Milestone timestamp documentation (ADR-0016 §D3) ────────────────────────
// first_post_at  — set once (WHERE first_post_at IS NULL) by social-post worker
// first_paid_at  — set once (WHERE first_paid_at IS NULL) by Stripe webhook
// churned_at     — set on each cancellation by Stripe webhook (may be overwritten)

// Root of all multi-tenant data. No RLS — this table IS the tenant boundary.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("trial"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** Operator-set flag: suspended tenants cannot enqueue new AI jobs. */
  suspended: boolean("suspended").notNull().default(false),
  /** Set when FADP hard-delete completes. Tenant row retained for audit. */
  erasedAt: timestamp("erased_at", { withTimezone: true }),
  /** Stamped once when the tenant's first AI post completes (ADR-0016). */
  firstPostAt: timestamp("first_post_at", { withTimezone: true }),
  /** Stamped once when the tenant first activates a paid subscription (ADR-0016). */
  firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
  /** Stamped when the tenant's subscription is canceled. May be overwritten on re-churn. */
  churnedAt: timestamp("churned_at", { withTimezone: true }),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
