import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./crm";
import { deals } from "./deals";
import { tenants } from "./tenants";

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body"),
    meta: jsonb("meta").notNull().default({}),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_tasks_tenant_id_idx").on(t.tenantId),
    index("crm_tasks_contact_id_idx").on(t.contactId),
    index("crm_tasks_tenant_status_due_idx").on(t.tenantId, t.status, t.dueAt),
  ],
);

export type CrmTask = typeof crmTasks.$inferSelect;
export type NewCrmTask = typeof crmTasks.$inferInsert;
