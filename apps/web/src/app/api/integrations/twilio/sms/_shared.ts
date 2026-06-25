import { db, integrationConnections, messages, webhookEvents } from "@marketing/db";
import {
  decryptTokens,
  formDataToTwilioParams,
  verifyTwilioWebhookSignature,
  type TwilioWebhookParams,
} from "@marketing/integrations";
import { env } from "@marketing/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { enqueueSmsWebhookJob } from "../../../../../server/queues/sms";

type ResolvedWebhookTenant = {
  tenantId: string;
  authToken: string;
};

function readToken(blob: string): string | null {
  if (!env.INTEGRATION_ENCRYPTION_KEY) return null;
  try {
    const tokens = decryptTokens(blob, env.INTEGRATION_ENCRYPTION_KEY);
    return typeof tokens["authToken"] === "string" ? tokens["authToken"] : null;
  } catch {
    return null;
  }
}

async function resolveInboundTenant(
  toNumber: string,
  fromNumber: string,
): Promise<ResolvedWebhookTenant | null> {
  const [connection] = await db
    .select({
      tenantId: integrationConnections.tenantId,
      oauthTokens: integrationConnections.oauthTokens,
    })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.provider, "twilio"),
        eq(integrationConnections.status, "connected"),
        sql`${integrationConnections.meta}->>'fromNumber' = ${toNumber}`,
      ),
    )
    .limit(1);
  if (connection) {
    const authToken = readToken(connection.oauthTokens);
    return authToken ? { tenantId: connection.tenantId, authToken } : null;
  }

  if (
    env.SMS_TEST_MODE_ENABLED !== "true" ||
    env.TWILIO_FROM_NUMBER !== toNumber ||
    !env.TWILIO_AUTH_TOKEN
  ) {
    return null;
  }
  const [lastOutbound] = await db
    .select({ tenantId: messages.tenantId })
    .from(messages)
    .where(
      and(
        eq(messages.channel, "sms"),
        eq(messages.direction, "outbound"),
        eq(messages.toAddress, fromNumber),
      ),
    )
    .orderBy(desc(messages.occurredAt))
    .limit(1);
  return lastOutbound
    ? { tenantId: lastOutbound.tenantId, authToken: env.TWILIO_AUTH_TOKEN }
    : null;
}

async function resolveStatusTenant(messageSid: string): Promise<ResolvedWebhookTenant | null> {
  const [message] = await db
    .select({ tenantId: messages.tenantId })
    .from(messages)
    .where(and(eq(messages.channel, "sms"), eq(messages.externalId, messageSid)))
    .limit(1);
  if (!message) return null;

  const [connection] = await db
    .select({ oauthTokens: integrationConnections.oauthTokens })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.tenantId, message.tenantId),
        eq(integrationConnections.provider, "twilio"),
        eq(integrationConnections.status, "connected"),
      ),
    )
    .limit(1);
  const authToken = connection ? readToken(connection.oauthTokens) : env.TWILIO_AUTH_TOKEN;
  return authToken ? { tenantId: message.tenantId, authToken } : null;
}

export async function acceptTwilioWebhook(input: {
  request: Request;
  eventType: "sms.inbound" | "sms.status";
  canonicalUrl: string;
}): Promise<Response> {
  const contentType = input.request.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return new Response("Unsupported webhook content type", { status: 415 });
  }
  const formData = await input.request.formData();
  const params = formDataToTwilioParams(formData);
  const messageSid = params["MessageSid"] ?? params["SmsSid"];
  if (!messageSid) return new Response("Missing MessageSid", { status: 400 });

  const resolved =
    input.eventType === "sms.inbound"
      ? await resolveInboundTenant(params["To"] ?? "", params["From"] ?? "")
      : await resolveStatusTenant(messageSid);
  if (!resolved) return new Response("Unknown SMS destination", { status: 404 });

  const signature = input.request.headers.get("x-twilio-signature");
  if (
    !verifyTwilioWebhookSignature({
      authToken: resolved.authToken,
      signature,
      url: input.canonicalUrl,
      params,
    })
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  const status = params["MessageStatus"] ?? params["SmsStatus"] ?? "received";
  const eventId =
    input.eventType === "sms.inbound" ? `inbound:${messageSid}` : `status:${messageSid}:${status}`;
  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      tenantId: resolved.tenantId,
      provider: "twilio",
      eventId,
      eventType: input.eventType,
      payload: params satisfies TwilioWebhookParams,
      signature,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted) await enqueueSmsWebhookJob(inserted.id);

  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
