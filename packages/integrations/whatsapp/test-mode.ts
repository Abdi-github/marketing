type WhatsAppTestModeEnv = {
  WHATSAPP_TEST_MODE_ENABLED?: string;
  WHATSAPP_TEST_TENANT_SLUG?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
};

export type WhatsAppTestModeConfig = {
  enabled: boolean;
  tenantSlug: string | null;
  phoneNumberId: string | null;
  hasAccessToken: boolean;
};

export function getWhatsAppTestModeConfig(env: WhatsAppTestModeEnv): WhatsAppTestModeConfig {
  return {
    enabled: env.WHATSAPP_TEST_MODE_ENABLED === "true",
    tenantSlug: env.WHATSAPP_TEST_TENANT_SLUG?.trim() || null,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null,
    hasAccessToken: Boolean(env.WHATSAPP_ACCESS_TOKEN?.trim()),
  };
}

export function getWhatsAppTestModeIssues(config: WhatsAppTestModeConfig): string[] {
  if (!config.enabled) return [];

  const issues: string[] = [];
  if (!config.tenantSlug) issues.push("WHATSAPP_TEST_TENANT_SLUG is missing");
  if (!config.phoneNumberId) issues.push("WHATSAPP_PHONE_NUMBER_ID is missing");
  if (!config.hasAccessToken) issues.push("WHATSAPP_ACCESS_TOKEN is missing");
  return issues;
}

export function hasCompleteWhatsAppTestModeConfig(config: WhatsAppTestModeConfig): boolean {
  return config.enabled && getWhatsAppTestModeIssues(config).length === 0;
}

export function isWhatsAppTestModeTenant(
  config: WhatsAppTestModeConfig,
  tenantSlug: string | null | undefined,
): boolean {
  return (
    hasCompleteWhatsAppTestModeConfig(config) && !!tenantSlug && config.tenantSlug === tenantSlug
  );
}

export function isWhatsAppTestModePhoneNumber(
  config: WhatsAppTestModeConfig,
  phoneNumberId: string | null | undefined,
): boolean {
  return (
    hasCompleteWhatsAppTestModeConfig(config) &&
    !!phoneNumberId &&
    config.phoneNumberId === phoneNumberId
  );
}
