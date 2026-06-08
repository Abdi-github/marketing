import { z } from "zod";

// Typed payload for the integrations.event.process BullMQ queue.
// Fan-out: webhook routes enqueue one job per received webhook_events row.
// Idempotency key = webhookEventId — same event never spawns two downstream jobs.
export const integrationEventJobSchema = z.object({
  tenantId: z.string().uuid(),
  webhookEventId: z.string().uuid(),
  provider: z.enum(["gastrofix", "lightspeed_ch", "eversports", "bexio", "meta", "google_business", "resend"]),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()),
});

export type IntegrationEventJob = z.infer<typeof integrationEventJobSchema>;

export const INTEGRATION_EVENT_QUEUE_NAME = "integrations.event.process" as const;
