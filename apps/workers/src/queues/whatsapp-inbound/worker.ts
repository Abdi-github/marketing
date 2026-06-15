// WhatsApp inbound message worker (step-29).
// Triggered by /api/webhooks/whatsapp for each incoming message.
// Creates/updates contact, stores message, sends AI greeter, emits outbox event.
// ADR-0024: Meta Cloud API for WhatsApp; 24-hour window for free-form replies.
import { createAnthropicHaiku, EchoProvider, getPrompt } from "@marketing/ai-router";
import { db } from "@marketing/db";
import { contacts, integrationConnections, messages, outbox, tenants } from "@marketing/db";
import { sendWhatsAppText } from "@marketing/integrations";
import { decryptTokens } from "@marketing/integrations";
import { env, logger } from "@marketing/shared";
import { UnrecoverableError, Worker } from "bullmq";
import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { connection, WHATSAPP_INBOUND_QUEUE_NAME } from "./queue";
import type { WhatsappInboundJob } from "./queue";

function buildProvider() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
    return new EchoProvider();
  }
  return createAnthropicHaiku();
}

async function processWhatsappInbound(job: Job<WhatsappInboundJob>): Promise<void> {
  const { tenantId, phoneNumberId, from, text, messageId } = job.data;

  // 1. Load tenant context for greeter personalisation.
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) {
    throw new UnrecoverableError(`Tenant ${tenantId} not found`);
  }

  // 2. Find/create contact by phone number (dedup on phone + tenantId).
  //    Phone is stored with the leading + (e.g. "+41791234567").
  const phoneNormalized = from.startsWith("+") ? from : `+${from}`;

  let [contact] = await db
    .select({ id: contacts.id, firstName: contacts.firstName })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, phoneNormalized)));

  if (!contact) {
    const [inserted] = await db
      .insert(contacts)
      .values({
        tenantId,
        email: `wa-${from}@noreply.whatsapp`,
        phone: phoneNormalized,
        source: "whatsapp",
        lifecycleStage: "subscriber",
      })
      .returning({ id: contacts.id, firstName: contacts.firstName });
    contact = inserted!;
    logger.info(
      { tenantId, contactId: contact.id },
      "[wa-inbound] new contact created via WhatsApp",
    );
  }

  // 3. Store inbound message.
  await db.insert(messages).values({
    tenantId,
    contactId: contact.id,
    channel: "whatsapp",
    direction: "inbound",
    fromAddress: phoneNormalized,
    toAddress: phoneNumberId,
    body: text,
    status: "delivered",
    externalId: messageId,
  });

  // 4. Load WA access token from integration_connections.
  const [conn] = await db
    .select({ oauthTokens: integrationConnections.oauthTokens })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.tenantId, tenantId),
        eq(integrationConnections.provider, "meta"),
      ),
    );

  const encKey = env.INTEGRATION_ENCRYPTION_KEY ?? "";
  const accessToken =
    conn && encKey
      ? (decryptTokens(conn.oauthTokens, encKey) as { accessToken?: string }).accessToken
      : (env.WHATSAPP_ACCESS_TOKEN ?? null);

  if (!accessToken) {
    logger.warn({ tenantId }, "[wa-inbound] no WA access token, skipping greeter");
    return;
  }

  // 5. Generate greeter reply via Haiku.
  const prompt = getPrompt("whatsapp-greeter-v1");
  const provider = buildProvider();

  let replyText = `Hallo! Danke für Ihre Nachricht. Wie kann ich Ihnen helfen?`;

  const userPromptStr = prompt.buildUserPrompt({
    businessName: tenant.name,
    vertical: "local business",
    city: "",
    locale: "de-CH",
    inboundText: text,
  });

  if (provider.complete) {
    try {
      const result = await provider.complete(
        {
          prompt: userPromptStr,
          systemPrompt: prompt.systemPrompt,
          maxTokens: 256,
        },
        {
          tenantId,
          jobId: job.id ?? crypto.randomUUID(),
          promptId: "whatsapp-greeter-v1",
          promptVersion: 1,
          costBudgetCents: 3,
        },
      );
      if (result.text?.trim()) {
        replyText = result.text.trim();
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "[wa-inbound] greeter AI failed, using fallback");
    }
  }

  // 6. Send reply via WhatsApp.
  const targetPhoneId = env.WHATSAPP_PHONE_NUMBER_ID ?? phoneNumberId;
  let externalReplyId: string | null = null;

  try {
    const sent = await sendWhatsAppText(targetPhoneId, accessToken, from, replyText);
    externalReplyId = sent.messageId;
  } catch (err) {
    logger.warn({ err: String(err) }, "[wa-inbound] failed to send WA reply");
  }

  // 7. Store outbound reply message.
  await db.insert(messages).values({
    tenantId,
    contactId: contact.id,
    channel: "whatsapp",
    direction: "outbound",
    fromAddress: phoneNumberId,
    toAddress: phoneNormalized,
    body: replyText,
    status: externalReplyId ? "sent" : "failed",
    externalId: externalReplyId,
  });

  // 8. Emit outbox event for downstream handlers (sequences, scoring).
  await db.insert(outbox).values({
    tenantId,
    type: "whatsapp.message_received",
    payload: {
      contactId: contact.id,
      tenantId,
      from: phoneNormalized,
      messageId,
      text,
    },
  });

  // 9. Update contact lastSeenAt.
  await db
    .update(contacts)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contact.id)));

  logger.info(
    { tenantId, contactId: contact.id, replied: Boolean(externalReplyId) },
    "[wa-inbound] processed",
  );
}

export const whatsappInboundWorker = new Worker<WhatsappInboundJob>(
  WHATSAPP_INBOUND_QUEUE_NAME,
  async (job) => {
    try {
      await processWhatsappInbound(job);
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      logger.error({ err: String(err), jobId: job.id }, "[wa-inbound] job failed");
      throw err;
    }
  },
  {
    connection,
    concurrency: 10,
  },
);

whatsappInboundWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[wa-inbound] job completed");
});

whatsappInboundWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, "[wa-inbound] job failed permanently");
});
