import { eq } from "drizzle-orm";
import type { Database } from "@marketing/db";
import { webhookEvents } from "@marketing/db"; // billing's webhook_events table (shared)
import type { TenantContext } from "@marketing/tenancy";
import type { WebhookEvent } from "../src/interface";
import { eversportsWebhookEventSchema } from "./webhook";

export async function processEversportsEvent(
  ctx: TenantContext,
  event: WebhookEvent,
  db: Database,
): Promise<void> {
  const parsed = eversportsWebhookEventSchema.safeParse(event.payload);
  if (!parsed.success) {
    throw new Error(`Invalid Eversports event payload: ${parsed.error.message}`);
  }

  const esEvent = parsed.data;

  switch (esEvent.eventType) {
    case "booking.created":
    case "booking.cancelled":
    case "activity.updated":
      // Domain integration: update local schedule cache or emit a domain event.
      // At MVP this is a stub — the event data is available in esEvent.data.
      break;
    default: {
      const exhaustive: never = esEvent.eventType;
      throw new Error(`Unhandled Eversports event type: ${exhaustive}`);
    }
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, event.id));
}
