import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

export const eversportsWebhookEventSchema = z.object({
  eventId: z.string(),
  eventType: z.enum(["booking.created", "booking.cancelled", "activity.updated"]),
  venueId: z.string(),
  data: z.record(z.unknown()),
  occurredAt: z.string(),
});

export type EversportsWebhookEvent = z.infer<typeof eversportsWebhookEventSchema>;

/**
 * Eversports signs webhook payloads with HMAC-SHA256.
 * Header: X-Eversports-Signature: <hex>
 */
export function verifyEversportsSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(signatureHeader, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export function extractEversportsEventId(payload: EversportsWebhookEvent): string {
  return payload.eventId;
}
