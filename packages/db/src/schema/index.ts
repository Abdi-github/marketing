import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ─── Feature flags (system-wide, explicitly NOT tenant-scoped) ────────────────
export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

// ─── Module schemas (order matters: tenants first, then auth, then tenancy) ───
export * from "./tenants";
export * from "./auth";
export * from "./tenancy";
export * from "./outbox";
export * from "./content";
export * from "./billing";
export * from "./landing-pages";
export * from "./integrations";
export * from "./crm";
export * from "./events";
export * from "./email";
export * from "./deals";
export * from "./crm-tasks";
export * from "./segments";
export * from "./messaging";
export * from "./notifications";
export * from "./copilot";
export * from "./metrics";
export * from "./domains";
export * from "./media";
export * from "./platform-admin";
