// Unit test: webhook idempotency logic.
// Validates that duplicate events are detected and skipped via webhook_events table.
import { describe, it, expect, beforeEach } from "vitest";

// The idempotency logic is embedded in the route handler. We test the core
// pattern here: INSERT ON CONFLICT DO NOTHING → no rows returned means duplicate.

type InsertResult = { id: string }[];

function makeWebhookEventsInsert(existingEventIds: Set<string>) {
  return {
    values: (row: { eventId: string }) => ({
      onConflictDoNothing: () => ({
        returning: async (): Promise<InsertResult> => {
          if (existingEventIds.has(row.eventId)) {
            return []; // Already processed — conflict, nothing inserted.
          }
          existingEventIds.add(row.eventId);
          return [{ id: crypto.randomUUID() }];
        },
      }),
    }),
  };
}

describe("Webhook idempotency (INSERT ON CONFLICT DO NOTHING pattern)", () => {
  let seen: Set<string>;

  beforeEach(() => {
    seen = new Set();
  });

  it("first delivery returns a row (not duplicate)", async () => {
    const insert = makeWebhookEventsInsert(seen);
    const result = await insert.values({ eventId: "evt_001" }).onConflictDoNothing().returning();
    expect(result).toHaveLength(1);
  });

  it("second delivery of the same event_id returns empty (duplicate)", async () => {
    const insert = makeWebhookEventsInsert(seen);
    await insert.values({ eventId: "evt_001" }).onConflictDoNothing().returning();
    const result = await insert.values({ eventId: "evt_001" }).onConflictDoNothing().returning();
    expect(result).toHaveLength(0);
  });

  it("different event_ids are each processed exactly once", async () => {
    const insert = makeWebhookEventsInsert(seen);
    const r1 = await insert.values({ eventId: "evt_A" }).onConflictDoNothing().returning();
    const r2 = await insert.values({ eventId: "evt_B" }).onConflictDoNothing().returning();
    const r3 = await insert.values({ eventId: "evt_A" }).onConflictDoNothing().returning(); // dup
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(r3).toHaveLength(0);
  });

  it("replaying all events twice — each handled exactly once", async () => {
    const eventIds = ["evt_sub_created", "evt_sub_updated", "evt_inv_paid"];
    const insert = makeWebhookEventsInsert(seen);

    // First pass.
    for (const eventId of eventIds) {
      const r = await insert.values({ eventId }).onConflictDoNothing().returning();
      expect(r).toHaveLength(1);
    }

    // Second pass (replay).
    for (const eventId of eventIds) {
      const r = await insert.values({ eventId }).onConflictDoNothing().returning();
      expect(r).toHaveLength(0);
    }
  });
});
