// aspsms.ch Swiss SMS client (FADP-compliant, Swiss-based infrastructure).
// ADR-0024: aspsms.ch primary for Swiss SMS; Twilio EU as deferred fallback.
// Docs: https://www.aspsms.com/documentation/

const ASPSMS_ENDPOINT = "https://json.aspsms.com/SendSimpleTextSMS";

export const SMS_SINGLE_SEGMENT_LIMIT = 160;
export const SMS_CONCAT_SEGMENT_LIMIT = 153;
export const SMS_MAX_RECOMMENDED_CHARS = 459;

export interface AspSmsOptions {
  userKey: string;
  password: string;
  originator: string;
  to: string;
  text: string;
}

export interface AspSmsSendResult {
  statusCode: string;
  statusInfo: string;
  messageId: string | null;
  recipient: string;
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

function validateOriginator(value: string): string {
  const originator = value.trim();
  if (!/^[A-Za-z0-9]{1,11}$/.test(originator)) {
    throw new Error("SMS sender name must be 1-11 alphanumeric characters.");
  }
  return originator;
}

export function estimateSmsSegments(text: string): number {
  const length = text.length;
  if (length === 0) return 0;
  if (length <= SMS_SINGLE_SEGMENT_LIMIT) return 1;
  return Math.ceil(length / SMS_CONCAT_SEGMENT_LIMIT);
}

function extractMessageId(data: Record<string, unknown>): string | null {
  const candidates = [
    data["MessageId"],
    data["MessageID"],
    data["MessageReference"],
    data["TransactionReference"],
    data["TrackingId"],
    data["TrackingID"],
  ];

  const value = candidates.find((candidate) => typeof candidate === "string");
  return typeof value === "string" && value.trim() ? value : null;
}

export async function sendSmsViaAspSms(opts: AspSmsOptions): Promise<AspSmsSendResult> {
  const recipient = normalizeSmsRecipient(opts.to);
  const originator = validateOriginator(opts.originator);
  const text = opts.text.trim();

  if (!text) {
    throw new Error("SMS body cannot be empty.");
  }
  if (text.length > SMS_MAX_RECOMMENDED_CHARS) {
    throw new Error(`SMS body is too long. Keep it under ${SMS_MAX_RECOMMENDED_CHARS} characters.`);
  }

  const res = await fetch(ASPSMS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UserName: opts.userKey,
      Password: opts.password,
      Originator: originator,
      Recipients: [recipient],
      MessageText: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`aspsms API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const statusCode = typeof data["StatusCode"] === "string" ? data["StatusCode"] : "";
  const statusInfo = typeof data["StatusInfo"] === "string" ? data["StatusInfo"] : "Unknown";
  if (statusCode !== "1") {
    throw new Error(`aspsms rejected: ${statusCode} - ${statusInfo}`);
  }

  return {
    statusCode,
    statusInfo,
    messageId: extractMessageId(data),
    recipient,
    characterCount: text.length,
    segmentCount: estimateSmsSegments(text),
    raw: data,
  };
}
