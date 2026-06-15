// aspsms.ch Swiss SMS client (FADP-compliant, Swiss-based infrastructure).
// ADR-0024: aspsms.ch primary for Swiss SMS; Twilio EU as deferred fallback.
// Docs: https://www.aspsms.com/documentation/

const ASPSMS_ENDPOINT = "https://json.aspsms.com/SendSimpleTextSMS";

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
}

export async function sendSmsViaAspSms(opts: AspSmsOptions): Promise<AspSmsSendResult> {
  const res = await fetch(ASPSMS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UserName: opts.userKey,
      Password: opts.password,
      Originator: opts.originator,
      Recipients: [opts.to],
      MessageText: opts.text,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`aspsms API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { StatusCode: string; StatusInfo: string };
  if (data.StatusCode !== "1") {
    throw new Error(`aspsms rejected: ${data.StatusCode} — ${data.StatusInfo}`);
  }

  return { statusCode: data.StatusCode, statusInfo: data.StatusInfo };
}
