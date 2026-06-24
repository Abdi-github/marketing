import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encryptTokens,
  normalizeE164,
  resolveSmsCredentials,
  verifyTwilioWebhookSignature,
} from "../index";

function signature(url: string, params: Record<string, string>, authToken: string): string {
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key] ?? ""}`)
      .join("");
  return createHmac("sha1", authToken).update(payload).digest("base64");
}

describe("Twilio SMS webhook verification", () => {
  const url = "https://example.test/api/integrations/twilio/sms/inbound";
  const authToken = "test-auth-token";
  const params = {
    AccountSid: "AC123",
    Body: "STOP",
    From: "+41761234567",
    MessageSid: "SM123",
    To: "+14406246520",
  };

  it("accepts a valid signature with evolving form parameters", () => {
    expect(
      verifyTwilioWebhookSignature({
        authToken,
        signature: signature(url, params, authToken),
        url,
        params,
      }),
    ).toBe(true);
  });

  it("rejects missing and tampered signatures", () => {
    expect(verifyTwilioWebhookSignature({ authToken, signature: null, url, params })).toBe(false);
    expect(
      verifyTwilioWebhookSignature({
        authToken,
        signature: signature(url, params, authToken),
        url,
        params: { ...params, Body: "START" },
      }),
    ).toBe(false);
  });
});

describe("Twilio phone normalization", () => {
  it("normalizes a Swiss international number", () => {
    expect(normalizeE164("+41 76 123 45 67")).toBe("+41761234567");
  });

  it("rejects a local or malformed number", () => {
    expect(() => normalizeE164("076 123 45 67")).toThrow(/international format/i);
  });
});

describe("Twilio tenant credential resolution", () => {
  const encryptionKey = "a".repeat(64);

  it("prefers encrypted tenant credentials over platform demo credentials", () => {
    const resolved = resolveSmsCredentials({
      tenantSlug: "abdi-restaurant",
      connection: {
        oauthTokens: encryptTokens(
          {
            accountSid: `AC${"1".repeat(32)}`,
            authToken: "tenant-auth-token",
            fromNumber: "+15551234567",
          },
          encryptionKey,
        ),
        meta: { fromNumber: "+15551234567" },
      },
      env: {
        INTEGRATION_ENCRYPTION_KEY: encryptionKey,
        SMS_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: `AC${"2".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "platform-auth-token",
        TWILIO_FROM_NUMBER: "+15557654321",
        SMS_TEST_MODE_ENABLED: "true",
        SMS_TEST_TENANT_SLUG: "abdi-restaurant",
      },
    });

    expect(resolved?.mode).toBe("tenant_connection");
    expect(resolved?.TWILIO_AUTH_TOKEN).toBe("tenant-auth-token");
    expect(resolved?.senderAddress).toBe("+15551234567");
  });

  it("allows platform credentials only for the explicit demo tenant", () => {
    const env = {
      SMS_PROVIDER: "twilio" as const,
      TWILIO_ACCOUNT_SID: `AC${"2".repeat(32)}`,
      TWILIO_AUTH_TOKEN: "platform-auth-token",
      TWILIO_FROM_NUMBER: "+15557654321",
      SMS_TEST_MODE_ENABLED: "true" as const,
      SMS_TEST_TENANT_SLUG: "abdi-restaurant",
    };

    expect(
      resolveSmsCredentials({ tenantSlug: "abdi-restaurant", connection: null, env })?.mode,
    ).toBe("platform_test");
    expect(
      resolveSmsCredentials({ tenantSlug: "another-tenant", connection: null, env }),
    ).toBeNull();
  });

  it("allows platform-managed credentials when entitlement has approved platform SMS", () => {
    const resolved = resolveSmsCredentials({
      tenantSlug: "paid-restaurant",
      connection: null,
      allowPlatformManaged: true,
      env: {
        SMS_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: `AC${"2".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "platform-auth-token",
        TWILIO_FROM_NUMBER: "+15557654321",
      },
    });

    expect(resolved?.mode).toBe("platform_managed");
    expect(resolved?.senderAddress).toBe("+15557654321");
  });
});
