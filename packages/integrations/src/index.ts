export type {
  IIntegrationAdapter,
  IntegrationConnection,
  ConnectCredentials,
  SyncResult,
  WebhookEvent,
  ConnectionStatus,
} from "./interface";

export { encryptTokens, decryptTokens, encryptCredentials, decryptCredentials } from "./crypto";
export { registerAdapter, getAdapter, listAdapters } from "./registry";

export { GastrofixAdapter } from "../gastrofix/adapter";
export {
  verifyGastrofixSignature,
  gastrofixWebhookEventSchema,
  type GastrofixWebhookEvent,
} from "../gastrofix/webhook";

export { LightspeedChAdapter } from "../lightspeed-ch/adapter";

export { EversportsAdapter } from "../eversports/adapter";
export {
  verifyEversportsSignature,
  eversportsWebhookEventSchema,
  type EversportsWebhookEvent,
} from "../eversports/webhook";

export { MetaAdapter } from "../meta/adapter";
export type { MetaTokens, PublishResult } from "../meta/adapter";
export { META_SCOPES, META_GRAPH_VERSION } from "../meta/config";

export { sendViaResend, interpolate } from "../resend/client";
export type { ResendEmailOptions, ResendSendResult, TemplateVars } from "../resend/client";

export {
  sendWhatsAppTemplate,
  sendWhatsAppText,
  verifyWhatsAppWebhook,
  verifyWhatsAppWebhookSignature,
  parseWhatsAppWebhook,
  WhatsAppApiError,
} from "../whatsapp/client";
export {
  getWhatsAppTestModeConfig,
  getWhatsAppTestModeIssues,
  hasCompleteWhatsAppTestModeConfig,
  isWhatsAppTestModePhoneNumber,
  isWhatsAppTestModeTenant,
} from "../whatsapp/test-mode";
export { resolveWhatsappCredentials } from "../whatsapp/credentials";
export type {
  WaTemplateComponent,
  WaSendResult,
  WaInboundMessage,
  WaWebhookEntry,
} from "../whatsapp/client";
export type { ResolvedWhatsappCredentials } from "../whatsapp/credentials";

export {
  getSmsProviderHealth,
  sendSmsViaConfiguredProvider,
  SMS_MAX_RECOMMENDED_CHARS as CONFIGURED_SMS_MAX_RECOMMENDED_CHARS,
} from "../sms/provider";
export type {
  ConfiguredSmsSendOptions,
  ConfiguredSmsSendResult,
  SmsProviderEnv,
  SmsProviderHealth,
  SmsProviderKey,
} from "../sms/provider";

export {
  estimateSmsSegments,
  sendSmsViaAspSms,
  SMS_CONCAT_SEGMENT_LIMIT,
  SMS_MAX_RECOMMENDED_CHARS,
  SMS_SINGLE_SEGMENT_LIMIT,
} from "../sms-aspsms/client";
export type { AspSmsOptions, AspSmsSendResult } from "../sms-aspsms/client";
export { sendSmsViaTwilio } from "../sms-twilio/client";
export type { TwilioSmsOptions, TwilioSmsSendResult } from "../sms-twilio/client";
export {
  formDataToTwilioParams,
  normalizeE164,
  verifyTwilioWebhookSignature,
} from "../sms-twilio/webhook";
export type { TwilioWebhookParams } from "../sms-twilio/webhook";
export { isSmsPlatformTestModeEnabled, resolveSmsCredentials } from "../sms/credentials";
export type { ResolvedSmsCredentials, SmsCredentialConnection } from "../sms/credentials";
