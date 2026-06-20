// WhatsApp Business Cloud API webhook handler (step-29).
// GET: Meta webhook subscription verification (hub.challenge handshake).
// POST: Processes inbound messages — resolves tenant by phoneNumberId,
//       enqueues whatsapp-inbound jobs (one per message).
// ADR-0024: webhook verification uses WHATSAPP_VERIFY_TOKEN env var.
import { db } from "@marketing/db";
import { integrationConnections } from "@marketing/db";
import {
  verifyWhatsAppWebhook,
  verifyWhatsAppWebhookSignature,
  parseWhatsAppWebhook,
} from "@marketing/integrations";
import { env, logger } from "@marketing/shared";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { enqueueWhatsappInboundJob } from "../../../../server/queues/whatsapp-inbound";

// ─── GET — Meta webhook subscription verification ────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const result = verifyWhatsAppWebhook(mode, token, challenge, env.WHATSAPP_VERIFY_TOKEN);
  if (result !== null) {
    return new Response(result, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  logger.warn({ mode, token }, "[wa-webhook] verification failed");
  return new Response("Forbidden", { status: 403 });
}

// ─── POST — Inbound message events ───────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");
  if (env.META_APP_SECRET) {
    if (
      !signatureHeader ||
      !verifyWhatsAppWebhookSignature(rawBody, signatureHeader, env.META_APP_SECRET)
    ) {
      logger.warn("[wa-webhook] signature verification failed");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const entries = parseWhatsAppWebhook(body);
  if (entries.length === 0) {
    // Status updates (delivery receipts etc.) — acknowledge and ignore.
    return new Response("OK", { status: 200 });
  }

  for (const entry of entries) {
    const { phoneNumberId, messages: inboundMessages } = entry;

    // Resolve tenant by phoneNumberId stored in integration_connections.meta.
    const [conn] = await db
      .select({ tenantId: integrationConnections.tenantId })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.provider, "meta"),
          sql`${integrationConnections.meta}->>'phoneNumberId' = ${phoneNumberId}`,
        ),
      );

    if (!conn) {
      // Fall back to env var for local dev / single-tenant setup.
      const tenantFromEnv = null;
      if (!tenantFromEnv) {
        logger.warn({ phoneNumberId }, "[wa-webhook] no tenant found for phoneNumberId, skipping");
        continue;
      }
    }

    const tenantId = conn?.tenantId ?? "";
    if (!tenantId) continue;

    for (const msg of inboundMessages) {
      if (!msg.text) continue; // skip non-text (image, audio) for now

      await enqueueWhatsappInboundJob({
        tenantId,
        phoneNumberId,
        messageId: msg.messageId,
        from: msg.from,
        text: msg.text,
        timestamp: msg.timestamp,
      });

      logger.debug({ tenantId, from: msg.from }, "[wa-webhook] job enqueued");
    }
  }

  return new Response("OK", { status: 200 });
}
