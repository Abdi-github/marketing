import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ─── outbox ───────────────────────────────────────────────────────────────────
// Domain events written atomically within producer DB transactions.
// A dispatcher worker tails this table and publishes to BullMQ.
// See docs/EVENTS.md and ADR-0007.
export const outbox = pgTable(
  "outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id").notNull().unique().defaultRandom(),
    // Nullable: platform-level events (e.g. provider.error_rate) have no tenant.
    tenantId: uuid("tenant_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishAttempts: integer("publish_attempts").notNull().default(0),
  },
  (t) => [
    index("outbox_unpublished_idx")
      .on(t.id)
      .where(sql`${t.publishedAt} IS NULL`),
    index("outbox_tenant_idx").on(t.tenantId),
  ],
);

// ─── event_processed ──────────────────────────────────────────────────────────
// Idempotency log per (event_id, handler_name). Handlers insert here before
// applying side effects; duplicate insert → conflict → early return.
export const eventProcessed = pgTable(
  "event_processed",
  {
    eventId: uuid("event_id").notNull(),
    handlerName: text("handler_name").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.eventId, t.handlerName],
      name: "event_processed_pk",
    }),
  ],
);

export type OutboxRow = typeof outbox.$inferSelect;
export type NewOutboxRow = typeof outbox.$inferInsert;
