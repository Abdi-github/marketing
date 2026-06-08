import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  verifyGastrofixSignature,
  gastrofixWebhookEventSchema,
} from "../../gastrofix/webhook";

const SECRET = "test-webhook-secret-32chars-min!!";

function makeSignature(body: string): string {
  const hex = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
  return `sha256=${hex}`;
}

const VALID_PAYLOAD = JSON.stringify({
  id: "evt-123",
  type: "reservation.created",
  locationId: "loc-001",
  data: { tableId: "t1", guestCount: 2 },
  timestamp: "2026-05-27T12:00:00Z",
});

describe("Gastrofix webhook signature verification", () => {
  it("passes a valid signature", () => {
    const sig = makeSignature(VALID_PAYLOAD);
    expect(verifyGastrofixSignature(VALID_PAYLOAD, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = makeSignature(VALID_PAYLOAD);
    const tampered = VALID_PAYLOAD.replace("2", "3");
    expect(verifyGastrofixSignature(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = makeSignature(VALID_PAYLOAD);
    expect(verifyGastrofixSignature(VALID_PAYLOAD, sig, "wrong-secret")).toBe(false);
  });

  it("rejects a missing algo prefix", () => {
    const hex = createHmac("sha256", SECRET).update(VALID_PAYLOAD, "utf8").digest("hex");
    expect(verifyGastrofixSignature(VALID_PAYLOAD, hex, SECRET)).toBe(false);
  });
});

describe("Gastrofix webhook event schema", () => {
  it("parses a valid reservation.created event", () => {
    const result = gastrofixWebhookEventSchema.safeParse(JSON.parse(VALID_PAYLOAD));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("evt-123");
      expect(result.data.type).toBe("reservation.created");
    }
  });

  it("rejects an unknown event type", () => {
    const bad = { ...JSON.parse(VALID_PAYLOAD), type: "unknown.event" };
    const result = gastrofixWebhookEventSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a payload missing required fields", () => {
    const result = gastrofixWebhookEventSchema.safeParse({ id: "x" });
    expect(result.success).toBe(false);
  });
});
