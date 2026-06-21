// WhatsApp Business Cloud API client (Meta Graph API v17.0).
// ADR-0024: Meta direct for cost; template messages only for outbound to new contacts.
import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_BASE = "https://graph.facebook.com/v17.0";

export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly type: string | null;
  readonly traceId: string | null;

  constructor(input: {
    status: number;
    message: string;
    code?: number | null;
    type?: string | null;
    traceId?: string | null;
  }) {
    super(input.message);
    this.name = "WhatsAppApiError";
    this.status = input.status;
    this.code = input.code ?? null;
    this.type = input.type ?? null;
    this.traceId = input.traceId ?? null;
  }
}

function formatWhatsAppApiError(status: number, rawText: string): WhatsAppApiError {
  try {
    const parsed = JSON.parse(rawText) as {
      error?: {
        message?: string;
        code?: number;
        type?: string;
        fbtrace_id?: string;
      };
    };
    const apiError = parsed.error;
    if (apiError) {
      const message =
        status === 401 || apiError.code === 190
          ? "WhatsApp authentication failed. The access token is invalid or expired."
          : apiError.message || `WhatsApp API error ${status}`;
      return new WhatsAppApiError({
        status,
        message,
        code: apiError.code ?? null,
        type: apiError.type ?? null,
        traceId: apiError.fbtrace_id ?? null,
      });
    }
  } catch {
    // Fall through to generic error.
  }

  return new WhatsAppApiError({
    status,
    message: `WhatsApp API error ${status}: ${rawText}`,
  });
}

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
  type:
    | "text"
    | "template"
    | "image"
    | "audio"
    | "document"
    | "location"
    | "contacts"
    | "interactive"
    | "button"
    | "unknown";
  text?: string;
  bodyPreview: string;
  timestamp: number;
  meta: Record<string, unknown>;
}

export interface WaWebhookStatusUpdate {
  messageId: string;
  recipientId: string | null;
  status: "sent" | "delivered" | "read" | "failed" | "unknown";
  timestamp: number;
  conversationExpiresAt: number | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
}

export interface WaWebhookEntry {
  phoneNumberId: string;
  messages: WaInboundMessage[];
  statuses: WaWebhookStatusUpdate[];
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
    throw formatWhatsAppApiError(res.status, text);
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
    throw formatWhatsAppApiError(res.status, text_);
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
            image?: { id?: string; mime_type?: string; caption?: string };
            document?: { id?: string; filename?: string; mime_type?: string; caption?: string };
            audio?: { id?: string; mime_type?: string };
            location?: {
              latitude?: number;
              longitude?: number;
              name?: string;
              address?: string;
            };
            contacts?: Array<{
              name?: { formatted_name?: string; first_name?: string; last_name?: string };
              phones?: Array<{ phone?: string; wa_id?: string }>;
              emails?: Array<{ email?: string }>;
            }>;
            button?: { text?: string; payload?: string };
            interactive?: {
              type?: string;
              button_reply?: { id?: string; title?: string };
              list_reply?: { id?: string; title?: string; description?: string };
              nfm_reply?: { body?: string; name?: string; response_json?: string };
            };
            timestamp: string;
          }>;
          statuses?: Array<{
            id?: string;
            status?: string;
            timestamp?: string;
            recipient_id?: string;
            conversation?: { expiration_timestamp?: string; id?: string; origin?: unknown };
            pricing?: unknown;
            errors?: Array<{ title?: string; code?: number; details?: string }>;
          }>;
        };
      }>;
    }>;
  };

  const normalizeMessageType = (type: string): WaInboundMessage["type"] => {
    return [
      "text",
      "template",
      "image",
      "audio",
      "document",
      "location",
      "contacts",
      "interactive",
      "button",
    ].includes(type)
      ? (type as WaInboundMessage["type"])
      : "unknown";
  };

  const buildMessagePreview = (
    type: WaInboundMessage["type"],
    source: {
      text?: { body?: string };
      image?: { caption?: string };
      document?: { filename?: string; caption?: string };
      location?: { name?: string; address?: string };
      contacts?: Array<{
        name?: { formatted_name?: string; first_name?: string; last_name?: string };
      }>;
      button?: { text?: string };
      interactive?: {
        button_reply?: { title?: string };
        list_reply?: { title?: string };
        nfm_reply?: { body?: string };
      };
    },
  ): string => {
    if (type === "text") return source.text?.body?.trim() ?? "";
    if (type === "image") return source.image?.caption?.trim() || "[Image]";
    if (type === "document") {
      return source.document?.caption?.trim() || source.document?.filename?.trim() || "[Document]";
    }
    if (type === "audio") return "[Audio]";
    if (type === "location") {
      return source.location?.name?.trim() || source.location?.address?.trim() || "[Location]";
    }
    if (type === "contacts") {
      const contact = source.contacts?.[0];
      return (
        contact?.name?.formatted_name?.trim() ||
        [contact?.name?.first_name, contact?.name?.last_name].filter(Boolean).join(" ") ||
        "[Contact card]"
      );
    }
    if (type === "button") return source.button?.text?.trim() || "[Button reply]";
    if (type === "interactive") {
      return (
        source.interactive?.button_reply?.title?.trim() ||
        source.interactive?.list_reply?.title?.trim() ||
        source.interactive?.nfm_reply?.body?.trim() ||
        "[Interactive reply]"
      );
    }
    return "[Unsupported message]";
  };

  const results: WaWebhookEntry[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const val = change.value;
      if (!val) continue;
      const hasMessages = Boolean(val?.messages?.length);
      const hasStatuses = Boolean(val?.statuses?.length);
      if (!hasMessages && !hasStatuses) continue;
      const phoneNumberId = val.metadata?.phone_number_id ?? "";
      const messages: WaInboundMessage[] = (val.messages ?? []).map((m) => {
        const type = normalizeMessageType(m.type);
        const meta: Record<string, unknown> = {};

        if (m.image) {
          meta.attachmentKinds = ["image"];
          meta.attachmentCount = 1;
          meta.attachmentId = m.image.id ?? null;
          meta.mimeType = m.image.mime_type ?? null;
        }
        if (m.document) {
          meta.attachmentKinds = ["document"];
          meta.attachmentCount = 1;
          meta.attachmentId = m.document.id ?? null;
          meta.filename = m.document.filename ?? null;
          meta.mimeType = m.document.mime_type ?? null;
        }
        if (m.audio) {
          meta.attachmentKinds = ["audio"];
          meta.attachmentCount = 1;
          meta.attachmentId = m.audio.id ?? null;
          meta.mimeType = m.audio.mime_type ?? null;
          meta.needsManualReview = true;
        }
        if (m.location) {
          meta.location = {
            latitude: m.location.latitude ?? null,
            longitude: m.location.longitude ?? null,
            name: m.location.name ?? null,
            address: m.location.address ?? null,
          };
          meta.locationLabel = m.location.name ?? m.location.address ?? null;
        }
        if (m.contacts?.length) {
          const firstContact = m.contacts[0];
          meta.contactCard = {
            name:
              firstContact?.name?.formatted_name ??
              [firstContact?.name?.first_name, firstContact?.name?.last_name]
                .filter(Boolean)
                .join(" ") ??
              null,
            phone: firstContact?.phones?.[0]?.phone ?? firstContact?.phones?.[0]?.wa_id ?? null,
            email: firstContact?.emails?.[0]?.email ?? null,
          };
        }
        if (m.button) {
          meta.buttonReply = m.button.text ?? null;
          meta.interactiveId = m.button.payload ?? null;
        }
        if (m.interactive) {
          meta.interactiveType = m.interactive.type ?? null;
          meta.interactiveId =
            m.interactive.button_reply?.id ??
            m.interactive.list_reply?.id ??
            m.interactive.nfm_reply?.name ??
            null;
          meta.interactiveTitle =
            m.interactive.button_reply?.title ??
            m.interactive.list_reply?.title ??
            m.interactive.nfm_reply?.body ??
            null;
          if (m.interactive.list_reply?.description) {
            meta.interactiveDescription = m.interactive.list_reply.description;
          }
        }

        const bodyPreview = buildMessagePreview(type, m);
        return {
          messageId: m.id,
          from: m.from,
          type,
          text: m.text?.body ?? bodyPreview,
          bodyPreview,
          timestamp: Number(m.timestamp),
          meta,
        };
      });
      const statuses: WaWebhookStatusUpdate[] = (val.statuses ?? []).map((status) => ({
        messageId: status.id ?? "",
        recipientId: status.recipient_id ?? null,
        status: (["sent", "delivered", "read", "failed"].includes(status.status ?? "")
          ? status.status
          : "unknown") as WaWebhookStatusUpdate["status"],
        timestamp: Number(status.timestamp ?? 0),
        conversationExpiresAt: status.conversation?.expiration_timestamp
          ? Number(status.conversation.expiration_timestamp)
          : null,
        errorMessage:
          status.errors
            ?.map((error) => error.title ?? error.details)
            .filter(Boolean)
            .join("; ") || null,
        meta: {
          conversationId: status.conversation?.id ?? null,
          origin: status.conversation?.origin ?? null,
          pricing: status.pricing ?? null,
          errors: status.errors ?? [],
        },
      }));
      results.push({ phoneNumberId, messages, statuses });
    }
  }
  return results;
}
