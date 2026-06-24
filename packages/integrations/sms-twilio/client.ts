import { estimateSmsSegments, SMS_MAX_RECOMMENDED_CHARS } from "../sms-aspsms/client";

const TWILIO_MESSAGES_ENDPOINT = "https://api.twilio.com/2010-04-01/Accounts";

export interface TwilioSmsOptions {
  accountSid: string;
  authToken: string;
  fromNumber?: string;
  messagingServiceSid?: string;
  statusCallbackUrl?: string;
  to: string;
  text: string;
}

export interface TwilioSmsSendResult {
  sid: string;
  status: string;
  fromAddress: string;
  toAddress: string;
  body: string;
  characterCount: number;
  segmentCount: number;
  raw: Record<string, unknown>;
}

function normalizeSmsRecipient(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{7,15}$/.test(normalized)) {
    throw new Error("SMS recipient must use international format, for example +41761234567.");
  }
  return normalized;
}

function normalizeTwilioFromNumber(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{7,15}$/.test(normalized)) {
    throw new Error("TWILIO_FROM_NUMBER must use international format, for example +14406246520.");
  }
  return normalized;
}

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

export async function sendSmsViaTwilio(opts: TwilioSmsOptions): Promise<TwilioSmsSendResult> {
  const to = normalizeSmsRecipient(opts.to);
  const text = opts.text.trim();
  if (!text) {
    throw new Error("SMS body cannot be empty.");
  }
  if (text.length > SMS_MAX_RECOMMENDED_CHARS) {
    throw new Error(`SMS body is too long. Keep it under ${SMS_MAX_RECOMMENDED_CHARS} characters.`);
  }

  const params = new URLSearchParams({
    To: to,
    Body: text,
  });
  if (opts.statusCallbackUrl) {
    params.set("StatusCallback", opts.statusCallbackUrl);
  }

  let fromAddress = opts.fromNumber?.trim() ?? "";
  if (opts.messagingServiceSid?.trim()) {
    params.set("MessagingServiceSid", opts.messagingServiceSid.trim());
    fromAddress = opts.messagingServiceSid.trim();
  } else if (opts.fromNumber?.trim()) {
    fromAddress = normalizeTwilioFromNumber(opts.fromNumber);
    params.set("From", fromAddress);
  } else {
    throw new Error("Configure TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
  }

  const res = await fetch(
    `${TWILIO_MESSAGES_ENDPOINT}/${encodeURIComponent(opts.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString(
          "base64",
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  const rawText = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    data = { message: rawText };
  }

  if (!res.ok) {
    const message = readString(data, "message") || readString(data, "detail") || res.statusText;
    throw new Error(`Twilio API error ${res.status}: ${message}`);
  }

  return {
    sid: readString(data, "sid"),
    status: readString(data, "status") || "queued",
    fromAddress: readString(data, "from") || fromAddress,
    toAddress: readString(data, "to") || to,
    body: text,
    characterCount: text.length,
    segmentCount: estimateSmsSegments(text),
    raw: data,
  };
}
