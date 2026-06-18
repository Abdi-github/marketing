import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./auth";

export const platformAuditOutcomeEnum = pgEnum("platform_audit_outcome", ["success", "failure"]);

export const supportSessionStatusEnum = pgEnum("support_session_status", [
  "active",
  "ended",
  "expired",
]);

export const platformAuditLogs = pgTable(
  "platform_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorPlatformRole: text("actor_platform_role"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: platformAuditOutcomeEnum("outcome").notNull().default("success"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("platform_audit_logs_actor_idx").on(t.actorId),
    index("platform_audit_logs_tenant_idx").on(t.tenantId),
    index("platform_audit_logs_action_idx").on(t.action, t.createdAt),
  ],
);

export const supportSessions = pgTable(
  "support_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reason: text("reason"),
    status: supportSessionStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedReason: text("ended_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("support_sessions_actor_idx").on(t.actorId, t.startedAt),
    index("support_sessions_tenant_idx").on(t.tenantId, t.startedAt),
    index("support_sessions_status_idx").on(t.status, t.startedAt),
  ],
);

export const tenantSupportNotes = pgTable(
  "tenant_support_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("general"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tenant_support_notes_tenant_idx").on(t.tenantId, t.createdAt),
    index("tenant_support_notes_author_idx").on(t.authorId, t.createdAt),
  ],
);

export type PlatformAuditLog = typeof platformAuditLogs.$inferSelect;
export type NewPlatformAuditLog = typeof platformAuditLogs.$inferInsert;
export type SupportSession = typeof supportSessions.$inferSelect;
export type NewSupportSession = typeof supportSessions.$inferInsert;
export type TenantSupportNote = typeof tenantSupportNotes.$inferSelect;
export type NewTenantSupportNote = typeof tenantSupportNotes.$inferInsert;
