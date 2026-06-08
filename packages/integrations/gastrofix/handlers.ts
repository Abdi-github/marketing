import { eq } from "drizzle-orm";
import type { Database } from "@marketing/db";
import { webhookEvents } from "@marketing/db"; // billing's webhook_events table (shared)
import type { TenantContext } from "@marketing/tenancy";
import type { WebhookEvent } from "../src/interface";
import { gastrofixWebhookEventSchema } from "./webhook";

export async function processGastrofixEvent(
  ctx: TenantContext,
  event: WebhookEvent,
  db: Database,
): Promise<void> {
  const parsed = gastrofixWebhookEventSchema.safeParse(event.payload);
  if (!parsed.success) {
    throw new Error(`Invalid Gastrofix event payload: ${parsed.error.message}`);
  }

  const gfEvent = parsed.data;

  switch (gfEvent.type) {
    case "reservation.created":
    case "reservation.updated":
    case "reservation.cancelled":
      // Domain integration: emit a domain event or update a local reservations cache.
      // At MVP this is a stub — the reservation data is available in gfEvent.data.
      break;
    default: {
      const exhaustive: never = gfEvent.type;
      throw new Error(`Unhandled Gastrofix event type: ${exhaustive}`);
    }
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, event.id));
}
