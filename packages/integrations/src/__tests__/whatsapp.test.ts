import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWhatsAppWebhookSignature } from "../index";

describe("WhatsApp webhook signature verification", () => {
  it("accepts a valid Meta webhook signature", () => {
    const rawBody = JSON.stringify({ entry: [{ id: "1" }] });
    const secret = "meta-app-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(verifyWhatsAppWebhookSignature(rawBody, `sha256=${signature}`, secret)).toBe(true);
  });

  it("rejects an invalid Meta webhook signature", () => {
    const rawBody = JSON.stringify({ entry: [{ id: "1" }] });

    expect(verifyWhatsAppWebhookSignature(rawBody, "sha256=deadbeef", "meta-app-secret")).toBe(
      false,
    );
  });
});
