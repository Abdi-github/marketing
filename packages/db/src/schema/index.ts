import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ─── Feature flags (system-wide, explicitly NOT tenant-scoped) ────────────────
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

// ─── Module schemas (order matters: tenants first, then auth, then tenancy) ───
export * from "./tenants";
export * from "./auth";
export * from "./tenancy";
export * from "./outbox";
