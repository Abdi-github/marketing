// WhatsApp Business Cloud API webhook handler.
// GET: Meta webhook subscription verification (hub.challenge handshake).
// POST: Processes inbound messages and delivery/read status updates.
import { db } from "@marketing/db";
import { integrationConnections, messages, tenants } from "@marketing/db";
import {
  getWhatsAppTestModeConfig,
  getWhatsAppTestModeIssues,
  isWhatsAppTestModePhoneNumber,
  parseWhatsAppWebhook,
  verifyWhatsAppWebhook,
  verifyWhatsAppWebhookSignature,
} from "@marketing/integrations";
import { env, logger } from "@marketing/shared";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { enqueueWhatsappInboundJob } from "../../../../server/queues/whatsapp-inbound";

async function resolveWhatsAppTestModeTenantId(phoneNumberId: string): Promise<string | null> {
  const testMode = getWhatsAppTestModeConfig(env);
  const issues = getWhatsAppTestModeIssues(testMode);
  if (issues.length > 0) {
    logger.warn({ issues }, "[wa-webhook] test mode is enabled but incomplete");
    return null;
  }
  if (!isWhatsAppTestModePhoneNumber(testMode, phoneNumberId)) return null;

  if (!testMode.tenantSlug) {
    logger.warn("[wa-webhook] test mode enabled but WHATSAPP_TEST_TENANT_SLUG is missing");
    return null;
  }

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, testMode.tenantSlug));

  if (!tenant) {
    logger.warn(
      { tenantSlug: testMode.tenantSlug },
      "[wa-webhook] test mode tenant slug not found",
    );
    return null;
  }

  return tenant.id;
}

async function updateConnectionMeta(
  tenantId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const [connectionRow] = await db
    .select({ id: integrationConnections.id, meta: integrationConnections.meta })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.tenantId, tenantId),
        eq(integrationConnections.provider, "meta"),
      ),
    )
    .limit(1);

  if (!connectionRow) return;

  await db
    .update(integrationConnections)
    .set({
      meta: {
        ...(connectionRow.meta as Record<string, unknown> | null),
        ...patch,
      },
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionRow.id));
}

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
    return new Response("OK", { status: 200 });
  }

  for (const entry of entries) {
    const { phoneNumberId, messages: inboundMessages, statuses } = entry;

    const [conn] = await db
      .select({ tenantId: integrationConnections.tenantId })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.provider, "meta"),
          sql`${integrationConnections.meta}->>'phoneNumberId' = ${phoneNumberId}`,
        ),
      )
      .limit(1);

    const tenantId = conn?.tenantId ?? (await resolveWhatsAppTestModeTenantId(phoneNumberId)) ?? "";
    if (!tenantId) continue;

    for (const status of statuses) {
      if (!status.messageId) continue;

      await db
        .update(messages)
        .set({
          status:
            status.status === "sent" ||
            status.status === "delivered" ||
            status.status === "read" ||
            status.status === "failed"
              ? status.status
              : "queued",
          errorMessage: status.errorMessage,
          meta: sql`COALESCE(${messages.meta}, '{}'::jsonb) || ${JSON.stringify({
            deliveryMeta: status.meta,
            conversationExpiresAt: status.conversationExpiresAt,
          })}::jsonb`,
        })
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.channel, "whatsapp"),
            eq(messages.externalId, status.messageId),
          ),
        );

      await updateConnectionMeta(tenantId, {
        lastStatusAt: new Date((status.timestamp || Date.now() / 1000) * 1000).toISOString(),
        lastDeliveryStatus: status.status,
        lastFailureAt: status.status === "failed" ? new Date().toISOString() : null,
        lastFailureMessage: status.status === "failed" ? status.errorMessage : null,
      });
    }

    for (const msg of inboundMessages) {
      await enqueueWhatsappInboundJob({
        tenantId,
        phoneNumberId,
        messageId: msg.messageId,
        from: msg.from,
        messageType: msg.type,
        text: msg.text ?? null,
        bodyPreview: msg.bodyPreview,
        meta: msg.meta,
        timestamp: msg.timestamp,
      });

      logger.debug({ tenantId, from: msg.from, type: msg.type }, "[wa-webhook] job enqueued");
    }
  }

  return new Response("OK", { status: 200 });
}
