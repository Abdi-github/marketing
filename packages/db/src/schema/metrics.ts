import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── tenant_metrics_daily ─────────────────────────────────────────────────────
// One row per (tenant, calendar day). Written by workers after job completion;
// backfilled on demand via ops.backfillMetrics tRPC mutation.
// See ADR-0016 §D2 — this is the ONLY source for activity aggregates on the
// retention dashboard. Never query social_posts/leads directly for dashboards.
export const tenantMetricsDaily = pgTable(
  "tenant_metrics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    dayDate: date("day_date").notNull(), // UTC calendar date (string: "YYYY-MM-DD")
    vertical: text("vertical").notNull(), // denormalized from business_profiles
    postsGenerated: integer("posts_generated").notNull().default(0),
    leadsCaptured: integer("leads_captured").notNull().default(0),
    plan: text("plan").notNull().default("trial"), // plan at close of day
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_metrics_daily_tenant_day_unique").on(
      t.tenantId,
      t.dayDate,
    ),
    index("tenant_metrics_daily_tenant_id_idx").on(t.tenantId),
    index("tenant_metrics_daily_day_date_idx").on(t.dayDate),
  ],
);

export type TenantMetricsDaily = typeof tenantMetricsDaily.$inferSelect;
export type NewTenantMetricsDaily = typeof tenantMetricsDaily.$inferInsert;
