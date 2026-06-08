import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  verifyEversportsSignature,
  eversportsWebhookEventSchema,
} from "../../eversports/webhook";

const SECRET = "test-eversports-secret-32chars!!!!";

function makeSignature(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

const VALID_PAYLOAD = JSON.stringify({
  eventId: "es-evt-456",
  eventType: "booking.created",
  venueId: "venue-001",
  data: { activityId: "class-1", userId: "user-42" },
  occurredAt: "2026-05-27T10:00:00Z",
});

describe("Eversports webhook signature verification", () => {
  it("passes a valid signature", () => {
    const sig = makeSignature(VALID_PAYLOAD);
    expect(verifyEversportsSignature(VALID_PAYLOAD, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = makeSignature(VALID_PAYLOAD);
    expect(verifyEversportsSignature(VALID_PAYLOAD + " ", sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = makeSignature(VALID_PAYLOAD);
    expect(verifyEversportsSignature(VALID_PAYLOAD, sig, "bad-secret")).toBe(false);
  });
});

describe("Eversports webhook event schema", () => {
  it("parses a valid booking.created event", () => {
    const result = eversportsWebhookEventSchema.safeParse(JSON.parse(VALID_PAYLOAD));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eventId).toBe("es-evt-456");
      expect(result.data.eventType).toBe("booking.created");
    }
  });

  it("rejects an unknown event type", () => {
    const bad = { ...JSON.parse(VALID_PAYLOAD), eventType: "unknown" };
    expect(eversportsWebhookEventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a payload missing venueId", () => {
    const { venueId: _, ...missing } = JSON.parse(VALID_PAYLOAD) as Record<string, unknown>;
    expect(eversportsWebhookEventSchema.safeParse(missing).success).toBe(false);
  });
});
