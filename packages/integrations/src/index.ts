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
} from "../whatsapp/client";
export type {
  WaTemplateComponent,
  WaSendResult,
  WaInboundMessage,
  WaWebhookEntry,
} from "../whatsapp/client";

export { sendSmsViaAspSms } from "../sms-aspsms/client";
export type { AspSmsOptions, AspSmsSendResult } from "../sms-aspsms/client";
