// WhatsApp Business Cloud API client (Meta Graph API v17.0).
// ADR-0024: Meta direct for cost; template messages only for outbound to new contacts.
import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_BASE = "https://graph.facebook.com/v17.0";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaTemplateComponent {
  type: "header" | "body" | "button";
  parameters: Array<{ type: "text"; text: string }>;
}

export interface WaSendResult {
  messageId: string;
}

export interface WaInboundMessage {
  messageId: string;
  from: string;
  type: "text" | "template" | "image" | "audio" | "unknown";
  text?: string;
  timestamp: number;
}

export interface WaWebhookEntry {
  phoneNumberId: string;
  messages: WaInboundMessage[];
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

/** Send a pre-approved template message to a recipient. */
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  language: string,
  components?: WaTemplateComponent[],
): Promise<WaSendResult> {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components && components.length > 0 ? { components } : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`WhatsApp API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { messages: Array<{ id: string }> };
  return { messageId: data.messages[0]?.id ?? "" };
}

/**
 * Send a plain text message.
 * Only allowed within the 24-hour customer-service window (inbound within 24h).
 */
export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
): Promise<WaSendResult> {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text_ = await res.text().catch(() => res.statusText);
    throw new Error(`WhatsApp API error ${res.status}: ${text_}`);
  }

  const data = (await res.json()) as { messages: Array<{ id: string }> };
  return { messageId: data.messages[0]?.id ?? "" };
}

// ─── Webhook helpers ──────────────────────────────────────────────────────────

/** Verify the Meta webhook subscription handshake. Returns hub.challenge on success. */
export function verifyWhatsAppWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  verifyToken: string,
): string | null {
  if (mode === "subscribe" && token === verifyToken) {
    return challenge;
  }
  return null;
}

/** Verify the Meta POST webhook signature (X-Hub-Signature-256). */
export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string,
): boolean {
  const [algo, signatureHex] = signatureHeader.split("=", 2);
  if (algo !== "sha256" || !signatureHex) return false;

  let received: Buffer;
  try {
    received = Buffer.from(signatureHex, "hex");
  } catch {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/**
 * Parse inbound webhook payload into a flat list of {phoneNumberId, messages}.
 * Returns empty array for status updates (delivery receipts).
 */
export function parseWhatsAppWebhook(body: unknown): WaWebhookEntry[] {
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{
            id: string;
            from: string;
            type: string;
            text?: { body: string };
            timestamp: string;
          }>;
        };
      }>;
    }>;
  };

  const results: WaWebhookEntry[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const val = change.value;
      if (!val?.messages?.length) continue;
      const phoneNumberId = val.metadata?.phone_number_id ?? "";
      const messages: WaInboundMessage[] = val.messages.map((m) => ({
        messageId: m.id,
        from: m.from,
        type: (["text", "template", "image", "audio"].includes(m.type)
          ? m.type
          : "unknown") as WaInboundMessage["type"],
        text: m.text?.body,
        timestamp: Number(m.timestamp),
      }));
      results.push({ phoneNumberId, messages });
    }
  }
  return results;
}
