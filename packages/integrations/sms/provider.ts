import {
  sendSmsViaAspSms,
  SMS_MAX_RECOMMENDED_CHARS,
  type AspSmsSendResult,
} from "../sms-aspsms/client";
import { sendSmsViaTwilio, type TwilioSmsSendResult } from "../sms-twilio/client";

export type SmsProviderKey = "aspsms" | "twilio" | "sandbox";

export interface SmsProviderEnv {
  SMS_PROVIDER?: SmsProviderKey;
  ASPSMS_USER_KEY?: string;
  ASPSMS_PASSWORD?: string;
  ASPSMS_ORIGINATOR?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  SMS_STATUS_CALLBACK_URL?: string;
}

export interface ConfiguredSmsSendOptions {
  to: string;
  text: string;
}

export interface ConfiguredSmsSendResult {
  provider: SmsProviderKey;
  providerLabel: string;
  fromAddress: string;
  toAddress: string;
  body: string;
  messageId: string | null;
  characterCount: number;
  segmentCount: number;
  statusCode: string | null;
  statusInfo: string | null;
  sandbox: boolean;
  raw: Record<string, unknown>;
}

export interface SmsProviderHealth {
  provider: SmsProviderKey;
  providerLabel: string;
  configured: boolean;
  senderLabel: string;
  missing: string[];
  maxRecommendedChars: number;
}

function selectedProvider(env: SmsProviderEnv): SmsProviderKey {
  return env.SMS_PROVIDER ?? "aspsms";
}

function senderForProvider(env: SmsProviderEnv, provider = selectedProvider(env)): string {
  if (provider === "twilio") {
    return env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER || "Twilio";
  }
  if (provider === "sandbox") {
    return "SMS Sandbox";
  }
  return env.ASPSMS_ORIGINATOR || "Marketing";
}

export function getSmsProviderHealth(env: SmsProviderEnv): SmsProviderHealth {
  const provider = selectedProvider(env);
  if (provider === "twilio") {
    const missing = [
      env.TWILIO_ACCOUNT_SID ? null : "TWILIO_ACCOUNT_SID",
      env.TWILIO_AUTH_TOKEN ? null : "TWILIO_AUTH_TOKEN",
      env.TWILIO_FROM_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID
        ? null
        : "TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID",
    ].filter((value): value is string => Boolean(value));

    return {
      provider,
      providerLabel: "Twilio",
      configured: missing.length === 0,
      senderLabel: senderForProvider(env, provider),
      missing,
      maxRecommendedChars: SMS_MAX_RECOMMENDED_CHARS,
    };
  }

  if (provider === "sandbox") {
    return {
      provider,
      providerLabel: "Sandbox",
      configured: true,
      senderLabel: senderForProvider(env, provider),
      missing: [],
      maxRecommendedChars: SMS_MAX_RECOMMENDED_CHARS,
    };
  }

  const missing = [
    env.ASPSMS_USER_KEY ? null : "ASPSMS_USER_KEY",
    env.ASPSMS_PASSWORD ? null : "ASPSMS_PASSWORD",
  ].filter((value): value is string => Boolean(value));

  return {
    provider,
    providerLabel: "aspsms.ch",
    configured: missing.length === 0,
    senderLabel: senderForProvider(env, provider),
    missing,
    maxRecommendedChars: SMS_MAX_RECOMMENDED_CHARS,
  };
}

function asConfiguredResult(result: AspSmsSendResult): ConfiguredSmsSendResult {
  return {
    provider: "aspsms",
    providerLabel: "aspsms.ch",
    fromAddress: "aspsms.ch",
    toAddress: result.recipient,
    body: "",
    messageId: result.messageId,
    characterCount: result.characterCount,
    segmentCount: result.segmentCount,
    statusCode: result.statusCode,
    statusInfo: result.statusInfo,
    sandbox: false,
    raw: result.raw,
  };
}

function twilioAsConfiguredResult(result: TwilioSmsSendResult): ConfiguredSmsSendResult {
  return {
    provider: "twilio",
    providerLabel: "Twilio",
    fromAddress: result.fromAddress,
    toAddress: result.toAddress,
    body: result.body,
    messageId: result.sid || null,
    characterCount: result.characterCount,
    segmentCount: result.segmentCount,
    statusCode: result.status,
    statusInfo: result.status,
    sandbox: false,
    raw: result.raw,
  };
}

export async function sendSmsViaConfiguredProvider(
  env: SmsProviderEnv,
  opts: ConfiguredSmsSendOptions,
): Promise<ConfiguredSmsSendResult> {
  const health = getSmsProviderHealth(env);
  if (!health.configured) {
    throw new Error(
      `SMS provider ${health.providerLabel} is missing: ${health.missing.join(", ")}`,
    );
  }

  if (health.provider === "sandbox") {
    const text = opts.text.trim();
    return {
      provider: "sandbox",
      providerLabel: "Sandbox",
      fromAddress: health.senderLabel,
      toAddress: opts.to,
      body: text,
      messageId: null,
      characterCount: text.length,
      segmentCount: text.length === 0 ? 0 : Math.ceil(text.length / 160),
      statusCode: "sandbox",
      statusInfo: "sandbox",
      sandbox: true,
      raw: {},
    };
  }

  if (health.provider === "twilio") {
    return twilioAsConfiguredResult(
      await sendSmsViaTwilio({
        accountSid: env.TWILIO_ACCOUNT_SID ?? "",
        authToken: env.TWILIO_AUTH_TOKEN ?? "",
        fromNumber: env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        statusCallbackUrl: env.SMS_STATUS_CALLBACK_URL,
        to: opts.to,
        text: opts.text,
      }),
    );
  }

  const result = asConfiguredResult(
    await sendSmsViaAspSms({
      userKey: env.ASPSMS_USER_KEY ?? "",
      password: env.ASPSMS_PASSWORD ?? "",
      originator: env.ASPSMS_ORIGINATOR ?? "Marketing",
      to: opts.to,
      text: opts.text,
    }),
  );

  return {
    ...result,
    fromAddress: env.ASPSMS_ORIGINATOR ?? "Marketing",
    body: opts.text.trim(),
  };
}

export { SMS_MAX_RECOMMENDED_CHARS };
