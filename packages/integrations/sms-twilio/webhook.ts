import { createHmac, timingSafeEqual } from "node:crypto";

export type TwilioWebhookParams = Record<string, string>;

export function verifyTwilioWebhookSignature(input: {
  authToken: string;
  signature: string | null;
  url: string;
  params: TwilioWebhookParams;
}): boolean {
  if (!input.signature || !input.authToken || !input.url) return false;

  const payload =
    input.url +
    Object.keys(input.params)
      .sort()
      .map((key) => `${key}${input.params[key] ?? ""}`)
      .join("");
  const expected = createHmac("sha1", input.authToken).update(payload).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(input.signature);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function formDataToTwilioParams(formData: FormData): TwilioWebhookParams {
  const params: TwilioWebhookParams = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

export function normalizeE164(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+\d{7,15}$/.test(normalized)) {
    throw new Error("Phone number must use international format, for example +41761234567.");
  }
  return normalized;
}
