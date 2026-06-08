import { db } from "@marketing/db";
import { webhookEvents } from "@marketing/db";
import { env } from "@marketing/shared";
import { verifyEversportsSignature, eversportsWebhookEventSchema } from "@marketing/integrations";

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-eversports-signature");

  if (!sigHeader) {
    return new Response("missing signature", { status: 401 });
  }

  const secret = env.EVERSPORTS_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("webhook not configured", { status: 503 });
  }

  // Verify signature BEFORE parsing body (per add-integration skill rule)
  if (!verifyEversportsSignature(rawBody, sigHeader, secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }

  const parsed = eversportsWebhookEventSchema.safeParse(payload);
  if (!parsed.success) {
    return new Response("invalid payload shape", { status: 400 });
  }

  const eventId = parsed.data.eventId;
  const eventType = parsed.data.eventType;

  const inserted = await db
    .insert(webhookEvents)
    .values({
      tenantId: null,
      provider: "eversports",
      eventId,
      eventType,
      signature: sigHeader,
      payload: payload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}
