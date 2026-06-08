import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

export const gastrofixWebhookEventSchema = z.object({
  id: z.string(),
  type: z.enum(["reservation.created", "reservation.updated", "reservation.cancelled"]),
  locationId: z.string(),
  data: z.record(z.unknown()),
  timestamp: z.string(),
});

export type GastrofixWebhookEvent = z.infer<typeof gastrofixWebhookEventSchema>;

/**
 * Gastrofix signs webhook payloads with HMAC-SHA256.
 * Header: X-Gastrofix-Signature: sha256=<hex>
 */
export function verifyGastrofixSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const [algo, hex] = signatureHeader.split("=");
  if (algo !== "sha256" || !hex) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(hex, "hex");

  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export function extractGastrofixEventId(payload: GastrofixWebhookEvent): string {
  return payload.id;
}
