import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  encryptTokens,
  parseWhatsAppWebhook,
  resolveWhatsappCredentials,
  verifyWhatsAppWebhookSignature,
} from "../index";

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

  it("parses richer inbound payloads and status updates", () => {
    const parsed = parseWhatsAppWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "pn-1" },
                messages: [
                  {
                    id: "wamid-1",
                    from: "41790000000",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "reserve", title: "Reserve now" },
                    },
                    timestamp: "1780000000",
                  },
                ],
                statuses: [
                  {
                    id: "wamid-1",
                    recipient_id: "41790000000",
                    status: "delivered",
                    timestamp: "1780000010",
                    conversation: { expiration_timestamp: "1780086400", id: "conv-1" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.phoneNumberId).toBe("pn-1");
    expect(parsed[0]?.messages[0]?.type).toBe("interactive");
    expect(parsed[0]?.messages[0]?.bodyPreview).toBe("Reserve now");
    expect(parsed[0]?.messages[0]?.meta.interactiveId).toBe("reserve");
    expect(parsed[0]?.statuses[0]?.status).toBe("delivered");
    expect(parsed[0]?.statuses[0]?.conversationExpiresAt).toBe(1780086400);
  });
});

describe("resolveWhatsappCredentials", () => {
  it("prefers a tenant integration connection when token and phone number id are present", () => {
    const oauthTokens = encryptTokens({ accessToken: "real-token" }, "a".repeat(64));

    const resolved = resolveWhatsappCredentials({
      tenantSlug: "abdi-restaurant",
      connection: {
        oauthTokens,
        meta: { phoneNumberId: "real-phone-id" },
      },
      env: {
        INTEGRATION_ENCRYPTION_KEY: "a".repeat(64),
        WHATSAPP_ACCESS_TOKEN: "test-token",
        WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
        WHATSAPP_TEST_MODE_ENABLED: "true",
        WHATSAPP_TEST_TENANT_SLUG: "abdi-restaurant",
      },
    });

    expect(resolved).toEqual({
      accessToken: "real-token",
      phoneNumberId: "real-phone-id",
      mode: "tenant_cloud_api",
    });
  });

  it("falls back to WhatsApp test mode for the configured tenant", () => {
    const resolved = resolveWhatsappCredentials({
      tenantSlug: "abdi-restaurant",
      connection: null,
      env: {
        WHATSAPP_ACCESS_TOKEN: "test-token",
        WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
        WHATSAPP_TEST_MODE_ENABLED: "true",
        WHATSAPP_TEST_TENANT_SLUG: "abdi-restaurant",
      },
    });

    expect(resolved).toEqual({
      accessToken: "test-token",
      phoneNumberId: "test-phone-id",
      mode: "demo_test_number",
    });
  });

  it("does not allow test mode for a different tenant", () => {
    const resolved = resolveWhatsappCredentials({
      tenantSlug: "other-tenant",
      connection: null,
      env: {
        WHATSAPP_ACCESS_TOKEN: "test-token",
        WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
        WHATSAPP_TEST_MODE_ENABLED: "true",
        WHATSAPP_TEST_TENANT_SLUG: "abdi-restaurant",
      },
    });

    expect(resolved).toBeNull();
  });
});
