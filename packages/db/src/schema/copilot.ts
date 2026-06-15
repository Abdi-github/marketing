import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const copilotThreads = pgTable(
  "copilot_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("copilot_threads_tenant_user_idx").on(t.tenantId, t.userId)],
);

export type CopilotThread = typeof copilotThreads.$inferSelect;

export const copilotMessages = pgTable(
  "copilot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Proposed tool calls awaiting user confirmation (role='assistant' only). */
    pendingActions: jsonb("pending_actions"),
    /** Results after actions were confirmed and executed. */
    actionResults: jsonb("action_results"),
    /** null = no action; false = awaiting confirm; true = confirmed. */
    confirmed: boolean("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("copilot_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export type CopilotMessage = typeof copilotMessages.$inferSelect;

// ─── Action type system ───────────────────────────────────────────────────────

export type CopilotActionType =
  | "create_landing_page"
  | "draft_email_sequence"
  | "enroll_contact"
  | "list_contacts"
  | "summarize_stats";

export type CopilotAction = {
  id: string;
  type: CopilotActionType;
  label: string;
  args: Record<string, unknown>;
  requiresConfirm: boolean;
};
