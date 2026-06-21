import { decryptTokens } from "../src/crypto";
import { getWhatsAppTestModeConfig, isWhatsAppTestModeTenant } from "./test-mode";

type WhatsappConnectionInput = {
  oauthTokens: string | null | undefined;
  meta: Record<string, unknown> | null | undefined;
};

type WhatsappCredentialEnv = {
  INTEGRATION_ENCRYPTION_KEY?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEST_MODE_ENABLED?: string;
  WHATSAPP_TEST_TENANT_SLUG?: string;
};

export type ResolvedWhatsappCredentials = {
  accessToken: string;
  phoneNumberId: string;
  mode: "tenant_cloud_api" | "demo_test_number";
};

export function resolveWhatsappCredentials(input: {
  tenantSlug: string | null | undefined;
  connection: WhatsappConnectionInput | null | undefined;
  env: WhatsappCredentialEnv;
}): ResolvedWhatsappCredentials | null {
  const connectedPhoneNumberId =
    input.connection?.meta && typeof input.connection.meta["phoneNumberId"] === "string"
      ? input.connection.meta["phoneNumberId"]
      : null;

  const encKey = input.env.INTEGRATION_ENCRYPTION_KEY ?? "";
  const connectedAccessToken =
    input.connection?.oauthTokens && encKey
      ? ((decryptTokens(input.connection.oauthTokens, encKey) as { accessToken?: string })
          .accessToken ?? null)
      : null;

  if (connectedAccessToken && connectedPhoneNumberId) {
    return {
      accessToken: connectedAccessToken,
      phoneNumberId: connectedPhoneNumberId,
      mode: "tenant_cloud_api",
    };
  }

  const testMode = getWhatsAppTestModeConfig(input.env);
  const canUseTestMode = isWhatsAppTestModeTenant(testMode, input.tenantSlug);
  if (!canUseTestMode || !input.env.WHATSAPP_ACCESS_TOKEN || !input.env.WHATSAPP_PHONE_NUMBER_ID) {
    return null;
  }

  return {
    accessToken: input.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: input.env.WHATSAPP_PHONE_NUMBER_ID,
    mode: "demo_test_number",
  };
}
