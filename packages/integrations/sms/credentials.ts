import { decryptTokens } from "../src/crypto";
import type { SmsProviderEnv, SmsProviderKey } from "./provider";

export type SmsCredentialConnection = {
  oauthTokens: string;
  meta?: Record<string, unknown> | null;
};

export type ResolvedSmsCredentials = SmsProviderEnv & {
  provider: SmsProviderKey;
  mode: "tenant_connection" | "platform_test";
  senderAddress: string;
};

type SmsCredentialEnv = SmsProviderEnv & {
  INTEGRATION_ENCRYPTION_KEY?: string;
  SMS_TEST_MODE_ENABLED?: string;
  SMS_TEST_TENANT_SLUG?: string;
};

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveSmsCredentials(input: {
  tenantSlug: string | null;
  connection: SmsCredentialConnection | null;
  env: SmsCredentialEnv;
}): ResolvedSmsCredentials | null {
  if (input.connection && input.env.INTEGRATION_ENCRYPTION_KEY) {
    try {
      const tokens = decryptTokens(
        input.connection.oauthTokens,
        input.env.INTEGRATION_ENCRYPTION_KEY,
      );
      const accountSid = readString(tokens, "accountSid");
      const authToken = readString(tokens, "authToken");
      const fromNumber =
        readString(tokens, "fromNumber") ?? readString(input.connection.meta ?? {}, "fromNumber");
      const messagingServiceSid =
        readString(tokens, "messagingServiceSid") ??
        readString(input.connection.meta ?? {}, "messagingServiceSid");

      if (accountSid && authToken && (fromNumber || messagingServiceSid)) {
        return {
          SMS_PROVIDER: "twilio",
          provider: "twilio",
          mode: "tenant_connection",
          senderAddress: messagingServiceSid ?? fromNumber!,
          TWILIO_ACCOUNT_SID: accountSid,
          TWILIO_AUTH_TOKEN: authToken,
          TWILIO_FROM_NUMBER: fromNumber,
          TWILIO_MESSAGING_SERVICE_SID: messagingServiceSid,
          SMS_STATUS_CALLBACK_URL: input.env.SMS_STATUS_CALLBACK_URL,
        };
      }
    } catch {
      return null;
    }
  }

  const isTestTenant =
    input.env.SMS_TEST_MODE_ENABLED === "true" &&
    Boolean(input.env.SMS_TEST_TENANT_SLUG) &&
    input.tenantSlug === input.env.SMS_TEST_TENANT_SLUG;
  if (!isTestTenant) return null;

  const provider = input.env.SMS_PROVIDER ?? "aspsms";
  if (provider === "twilio") {
    if (
      !input.env.TWILIO_ACCOUNT_SID ||
      !input.env.TWILIO_AUTH_TOKEN ||
      (!input.env.TWILIO_FROM_NUMBER && !input.env.TWILIO_MESSAGING_SERVICE_SID)
    ) {
      return null;
    }
    return {
      ...input.env,
      provider,
      mode: "platform_test",
      senderAddress:
        input.env.TWILIO_MESSAGING_SERVICE_SID ?? input.env.TWILIO_FROM_NUMBER ?? "Twilio",
    };
  }

  if (provider === "sandbox") {
    return {
      ...input.env,
      provider,
      mode: "platform_test",
      senderAddress: "SMS Sandbox",
    };
  }

  if (!input.env.ASPSMS_USER_KEY || !input.env.ASPSMS_PASSWORD) return null;
  return {
    ...input.env,
    provider,
    mode: "platform_test",
    senderAddress: input.env.ASPSMS_ORIGINATOR ?? "Marketing",
  };
}

export function isSmsTestModeTenant(
  env: Pick<SmsCredentialEnv, "SMS_TEST_MODE_ENABLED" | "SMS_TEST_TENANT_SLUG">,
  tenantSlug: string | null,
): boolean {
  return (
    env.SMS_TEST_MODE_ENABLED === "true" &&
    Boolean(env.SMS_TEST_TENANT_SLUG) &&
    env.SMS_TEST_TENANT_SLUG === tenantSlug
  );
}
