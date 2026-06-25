import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tenants } from "./tenants";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    status: text("status").notNull().default("unread"),
    priority: text("priority").notNull().default("normal"),
    actionUrl: text("action_url"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
    index("notifications_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("notifications_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    staffSmsEnabled: boolean("staff_sms_enabled").notNull().default(true),
    staffSmsPhone: text("staff_sms_phone"),
    quietHoursStart: text("quiet_hours_start").notNull().default("20:00"),
    quietHoursEnd: text("quiet_hours_end").notNull().default("08:00"),
    timezone: text("timezone").notNull().default("Europe/Zurich"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_preferences_tenant_unique").on(t.tenantId),
    index("notification_preferences_tenant_idx").on(t.tenantId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
