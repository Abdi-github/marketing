import {
  contacts,
  crmTasks,
  db,
  leads,
  messages,
  notifications,
  smsPreferences,
  smsSequenceEnrollments,
  webhookEvents,
} from "@marketing/db";
import {
  buildPhoneLeadPlaceholderEmail,
  classifySmsKeyword,
  logger,
  normalizeSmsPhone,
} from "@marketing/shared";
import { and, desc, eq } from "drizzle-orm";
import { Worker, type Job } from "bullmq";
import { smsSendQueue } from "../sms-send/queue";
import { connection, SMS_WEBHOOK_QUEUE_NAME, type SmsWebhookJob } from "./queue";

function asParams(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function mapTwilioStatus(
  status: string,
): "queued" | "sent" | "delivered" | "undelivered" | "failed" {
  if (status === "delivered") return "delivered";
  if (status === "undelivered") return "undelivered";
  if (status === "failed") return "failed";
  if (["sent", "sending"].includes(status)) return "sent";
  return "queued";
}

function extractReplyFacts(body: string): Record<string, string> {
  const facts: Record<string, string> = {};
  const party = body.match(/\b(?:party|people|persons|guests?)\s*(?:of|:)?\s*(\d{1,2})\b/i);
  const time = body.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/);
  const date = body.match(/\b(20\d{2})-(\d{2})-(\d{2})\b|\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (party?.[1]) facts["partySize"] = party[1];
  if (time) facts["reservationTime"] = `${time[1]!.padStart(2, "0")}:${time[2]}`;
  if (date) {
    facts["reservationDate"] = date[1]
      ? `${date[1]}-${date[2]}-${date[3]}`
      : `${date[6]}-${date[5]!.padStart(2, "0")}-${date[4]!.padStart(2, "0")}`;
  }
  return facts;
}

async function processStatus(event: typeof webhookEvents.$inferSelect): Promise<void> {
  const params = asParams(event.payload);
  const messageSid = params["MessageSid"] ?? params["SmsSid"];
  if (!messageSid || !event.tenantId) return;
  const status = mapTwilioStatus(params["MessageStatus"] ?? params["SmsStatus"] ?? "queued");
  await db
    .update(messages)
    .set({
      status,
      errorMessage:
        status === "failed" || status === "undelivered"
          ? (params["ErrorMessage"] ?? params["ErrorCode"] ?? "Twilio delivery failed.")
          : null,
    })
    .where(
      and(
        eq(messages.tenantId, event.tenantId),
        eq(messages.channel, "sms"),
        eq(messages.externalId, messageSid),
      ),
    );
  if (status === "failed" || status === "undelivered") {
    await db
      .insert(notifications)
      .values({
        tenantId: event.tenantId,
        type: "automation.failed",
        title: "SMS delivery needs attention",
        body: "A customer SMS could not be delivered. Open the Inbox to review the contact and try another channel.",
        priority: "high",
        actionUrl: "/en/crm/inbox",
        entityType: "message",
        idempotencyKey: `sms-status-failed:${messageSid}`,
        metadata: {
          messageSid,
          status,
          errorCode: params["ErrorCode"],
          errorMessage: params["ErrorMessage"],
        },
      })
      .onConflictDoNothing({ target: [notifications.tenantId, notifications.idempotencyKey] });
  }
}

async function processInbound(event: typeof webhookEvents.$inferSelect): Promise<void> {
  if (!event.tenantId) return;
  const params = asParams(event.payload);
  const messageSid = params["MessageSid"] ?? params["SmsSid"];
  const from = normalizeSmsPhone(params["From"] ?? "");
  const to = normalizeSmsPhone(params["To"] ?? "");
  const mediaCount = Number(params["NumMedia"] ?? 0);
  const body = (params["Body"] ?? "").trim() || (mediaCount > 0 ? "[Media message]" : "");
  if (!messageSid) return;

  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, event.tenantId), eq(contacts.phone, from)))
    .limit(1);
  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({
        tenantId: event.tenantId,
        email: buildPhoneLeadPlaceholderEmail(from),
        phone: from,
        source: "sms",
      })
      .returning();
  }
  if (!contact) return;

  await db
    .insert(messages)
    .values({
      tenantId: event.tenantId,
      contactId: contact.id,
      channel: "sms",
      direction: "inbound",
      fromAddress: from,
      toAddress: to,
      body,
      messageType: mediaCount > 0 ? "media" : "text",
      status: "delivered",
      externalId: messageSid,
      meta: {
        provider: "twilio",
        numMedia: mediaCount,
        mediaUrls: Array.from(
          { length: mediaCount },
          (_, index) => params[`MediaUrl${index}`],
        ).filter((value): value is string => Boolean(value)),
      },
    })
    .onConflictDoNothing();

  await db
    .insert(notifications)
    .values({
      tenantId: event.tenantId,
      type: "inbox.reply_needed",
      title: "Customer replied by SMS",
      body: "Open the Inbox to read the message and continue the conversation.",
      priority: "high",
      actionUrl: `/en/crm/inbox`,
      entityType: "contact",
      entityId: contact.id,
      idempotencyKey: `sms-inbound:${messageSid}`,
      metadata: {
        contactId: contact.id,
        phone: from,
        messageSid,
        preview: body.slice(0, 120),
      },
    })
    .onConflictDoNothing({ target: [notifications.tenantId, notifications.idempotencyKey] });

  const keyword = classifySmsKeyword(body);
  if (keyword === "help") {
    const [helpMessage] = await db
      .insert(messages)
      .values({
        tenantId: event.tenantId,
        contactId: contact.id,
        channel: "sms",
        direction: "outbound",
        fromAddress: to,
        toAddress: from,
        body: "Reply to this number for assistance. Reply STOP to stop non-essential SMS messages.",
        messageType: "help",
        status: "queued",
        meta: { automated: true, purpose: "manual_reply", provider: "twilio" },
      })
      .returning({ id: messages.id });
    if (helpMessage) {
      await smsSendQueue.add(
        "send",
        { tenantId: event.tenantId, messageId: helpMessage.id },
        { jobId: `sms-send-${helpMessage.id}` },
      );
    }
    return;
  }
  if (keyword === "stop" || keyword === "start") {
    await db
      .insert(smsPreferences)
      .values({
        tenantId: event.tenantId,
        contactId: contact.id,
        phone: from,
        marketingOptIn: keyword === "start",
        status: keyword === "stop" ? "opted_out" : "active",
        source: "twilio_keyword",
        optedOutAt: keyword === "stop" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [smsPreferences.tenantId, smsPreferences.phone],
        set: {
          contactId: contact.id,
          marketingOptIn: keyword === "start",
          status: keyword === "stop" ? "opted_out" : "active",
          source: "twilio_keyword",
          optedOutAt: keyword === "stop" ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    if (keyword === "stop") {
      await db
        .update(smsSequenceEnrollments)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(
          and(
            eq(smsSequenceEnrollments.tenantId, event.tenantId),
            eq(smsSequenceEnrollments.contactId, contact.id),
            eq(smsSequenceEnrollments.status, "enrolled"),
          ),
        );
    }
    return;
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, event.tenantId), eq(leads.contactId, contact.id)))
    .orderBy(desc(leads.submittedAt))
    .limit(1);
  if (!lead) return;

  const facts = extractReplyFacts(body);
  const structured =
    lead.structuredData && typeof lead.structuredData === "object"
      ? (lead.structuredData as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...structured, ...facts, lastSmsReply: body };
  const hasDate = Boolean(merged["reservationDate"]);
  const hasTime = Boolean(merged["reservationTime"]);
  const hasPartySize = Boolean(merged["partySize"]);
  await db
    .update(leads)
    .set({
      status: "contacted",
      workflowState:
        lead.workflowKind === "booking" && hasDate && hasTime && hasPartySize
          ? "awaiting_confirmation"
          : "contacted",
      structuredData: merged,
      lastAutomationAt: new Date(),
    })
    .where(and(eq(leads.tenantId, event.tenantId), eq(leads.id, lead.id)));

  const [task] = await db
    .select({ id: crmTasks.id, body: crmTasks.body, meta: crmTasks.meta })
    .from(crmTasks)
    .where(
      and(
        eq(crmTasks.tenantId, event.tenantId),
        eq(crmTasks.contactId, contact.id),
        eq(crmTasks.status, "open"),
      ),
    )
    .orderBy(desc(crmTasks.createdAt))
    .limit(1);
  if (task) {
    const taskMeta =
      task.meta && typeof task.meta === "object" ? (task.meta as Record<string, unknown>) : {};
    await db
      .update(crmTasks)
      .set({
        body: [task.body, `Customer SMS reply: ${body}`].filter(Boolean).join("\n\n"),
        meta: { ...taskMeta, lastSmsReply: body, extractedSmsFacts: facts },
        updatedAt: new Date(),
      })
      .where(and(eq(crmTasks.tenantId, event.tenantId), eq(crmTasks.id, task.id)));
  }
}

async function processWebhook(rawJob: Job<SmsWebhookJob>): Promise<void> {
  const [event] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, rawJob.data.webhookEventId))
    .limit(1);
  if (!event || event.processedAt) return;

  if (event.eventType === "sms.status") await processStatus(event);
  if (event.eventType === "sms.inbound") await processInbound(event);
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, event.id));
}

export const smsWebhookWorker = new Worker<SmsWebhookJob>(SMS_WEBHOOK_QUEUE_NAME, processWebhook, {
  connection,
  concurrency: 8,
});

smsWebhookWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error: String(error) }, "[sms-webhook] failed");
});
