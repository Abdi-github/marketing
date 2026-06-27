// Unified inbox router (step-29).
// Threads = grouped messages per contact per channel.
import { db } from "@marketing/db";
import {
  businessProfiles,
  contacts,
  crmTasks,
  leads,
  messages,
  outbox,
  tenants,
} from "@marketing/db";
import { getSmsProviderHealth } from "@marketing/integrations";
import {
  buildLeadConfirmationCopy,
  computeWhatsappConversationState,
  env,
  normalizeSmsPhone,
  normalizeLeadCaptureSettings,
  reservationStatusChangedV1,
} from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enqueueSmsSendJob, enqueueSmsSequenceTriggerJob } from "../../queues/sms";
import { tenantProcedure, router } from "../trpc";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function valueFromAnyKey(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = textValue(source[key]);
    if (direct) return direct;
    const matchingKey = Object.keys(source).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    );
    if (matchingKey) {
      const matched = textValue(source[matchingKey]);
      if (matched) return matched;
    }
  }
  return null;
}

function leadChannelPreference(lead: {
  payload: unknown;
  structuredData: unknown;
  sourceChannel: string | null;
}): "email" | "sms" | "whatsapp" | null {
  const data = { ...asRecord(lead.payload), ...asRecord(lead.structuredData) };
  const raw = valueFromAnyKey(data, [
    "preferredChannel",
    "preferred_channel",
    "channel",
    "contactMethod",
    "contact_method",
    "replyBy",
    "reply_by",
  ]);
  const normalized = raw?.toLowerCase() ?? "";
  if (normalized.includes("sms") || normalized.includes("text")) return "sms";
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("email") || normalized.includes("mail")) return "email";
  if (lead.sourceChannel === "sms") return "sms";
  if (lead.sourceChannel === "whatsapp") return "whatsapp";
  return null;
}

const automationIssueInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send_failed"),
    messageId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("lead_attention"),
    leadId: z.string().uuid(),
  }),
]);

function reservationDetails(payload: Record<string, unknown>): string {
  const date = valueFromAnyKey(payload, ["date", "reservation_date", "reservationDate"]);
  const time = valueFromAnyKey(payload, ["time", "reservation_time", "reservationTime"]);
  const guests = valueFromAnyKey(payload, [
    "party_size",
    "partySize",
    "guest_count",
    "guests",
    "people",
  ]);
  return [
    date ? `Date: ${date}` : null,
    time ? `Time: ${time}` : null,
    guests ? `Guests: ${guests}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function shortenSms(text: string, limit = 459): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 3).trimEnd()}...`;
}

function buildReservationConfirmedSms(input: {
  businessName: string;
  locale: string | null;
  payload: Record<string, unknown>;
}): string {
  const details = reservationDetails(input.payload);
  const suffix = details ? ` ${details}.` : "";
  if (input.locale === "de-CH") {
    return shortenSms(
      `${input.businessName}: Ihre Reservierung ist bestaetigt.${suffix} Wir freuen uns auf Ihren Besuch.`,
    );
  }
  if (input.locale === "fr-CH") {
    return shortenSms(
      `${input.businessName}: Votre reservation est confirmee.${suffix} Nous nous rejouissons de vous accueillir.`,
    );
  }
  if (input.locale === "it-CH") {
    return shortenSms(
      `${input.businessName}: La tua prenotazione e confermata.${suffix} Ti aspettiamo con piacere.`,
    );
  }
  return shortenSms(
    `${input.businessName}: Your reservation is confirmed.${suffix} We look forward to welcoming you.`,
  );
}

async function queueReservationConfirmationSms(input: {
  tenantId: string;
  leadId: string;
  contactId: string | null;
}): Promise<{ queued: boolean; reason?: string }> {
  if (!input.contactId) return { queued: false, reason: "Lead has no contact." };

  const [[lead], [contact], [profile]] = await Promise.all([
    db
      .select({
        id: leads.id,
        workflowKind: leads.workflowKind,
        payload: leads.payload,
        structuredData: leads.structuredData,
        sourceChannel: leads.sourceChannel,
      })
      .from(leads)
      .where(and(eq(leads.tenantId, input.tenantId), eq(leads.id, input.leadId)))
      .limit(1),
    db
      .select({ id: contacts.id, phone: contacts.phone })
      .from(contacts)
      .where(and(eq(contacts.tenantId, input.tenantId), eq(contacts.id, input.contactId)))
      .limit(1),
    db
      .select({
        businessName: businessProfiles.businessName,
        locale: businessProfiles.locale,
        leadCaptureSettings: businessProfiles.leadCaptureSettings,
      })
      .from(businessProfiles)
      .where(eq(businessProfiles.tenantId, input.tenantId))
      .limit(1),
  ]);

  if (!lead || lead.workflowKind !== "booking") {
    return { queued: false, reason: "Lead is not a reservation." };
  }
  if (!contact?.phone) return { queued: false, reason: "Contact has no phone number." };

  const settings = normalizeLeadCaptureSettings(profile?.leadCaptureSettings);
  const customerPreference = leadChannelPreference(lead);
  if (customerPreference && customerPreference !== "sms") {
    return { queued: false, reason: `Customer preferred ${customerPreference}.` };
  }
  if (!customerPreference && settings.preferredConfirmationChannel !== "sms") {
    return { queued: false, reason: "SMS is not the configured confirmation channel." };
  }

  let toAddress: string;
  try {
    toAddress = normalizeSmsPhone(contact.phone);
  } catch {
    return { queued: false, reason: "Contact phone is not a valid SMS number." };
  }

  const [existing] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, input.tenantId),
        eq(messages.contactId, input.contactId),
        eq(messages.channel, "sms"),
        eq(messages.messageType, "reservation_confirmation"),
        sql`${messages.meta}->>'leadId' = ${input.leadId}`,
      ),
    )
    .limit(1);
  if (existing) return { queued: false, reason: "Reservation confirmation already queued." };

  const payload = { ...asRecord(lead.payload), ...asRecord(lead.structuredData) };
  const copy = buildLeadConfirmationCopy({
    kind: "booking",
    businessName: profile?.businessName ?? "Our team",
    locale: profile?.locale ?? "en",
    payload,
    settings,
  });
  const body = buildReservationConfirmedSms({
    businessName: profile?.businessName ?? "Our team",
    locale: profile?.locale ?? "en",
    payload,
  });
  const providerHealth = getSmsProviderHealth(env);

  const [message] = await db
    .insert(messages)
    .values({
      tenantId: input.tenantId,
      contactId: input.contactId,
      channel: "sms",
      direction: "outbound",
      fromAddress: providerHealth.senderLabel,
      toAddress,
      body,
      messageType: "reservation_confirmation",
      status: "queued",
      meta: {
        automated: true,
        leadId: input.leadId,
        purpose: "sequence_transactional",
        trigger: "reservation_confirmed",
        provider: providerHealth.provider,
        providerLabel: providerHealth.providerLabel,
        acknowledgementSubject: copy.subject,
      },
    })
    .returning({ id: messages.id });

  if (!message) return { queued: false, reason: "Could not create SMS message." };
  await enqueueSmsSendJob({ tenantId: input.tenantId, messageId: message.id });
  return { queued: true };
}

export const inboxRouter = router({
  /**
   * List message threads — one entry per (contact, channel) pair, sorted by last message.
   * Each thread includes: contact info + last message + unread count.
   */
  listThreads: tenantProcedure
    .input(
      z.object({
        channel: z.enum(["email", "sms", "whatsapp"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const channelFilter = input.channel ? sql`AND m.channel = ${input.channel}` : sql``;

      // Aggregate threads: latest message + count per (contact_id, channel).
      const rows = await db.execute(sql`
        SELECT
          m.contact_id,
          m.channel,
          MAX(m.occurred_at) AS last_message_at,
          MAX(CASE WHEN m.direction = 'inbound' THEN m.occurred_at END) AS last_inbound_at,
          COUNT(*) AS total_messages,
          (
            SELECT body FROM messages m2
            WHERE m2.contact_id = m.contact_id
              AND m2.channel = m.channel
              AND m2.tenant_id = ${tenantId}
            ORDER BY occurred_at DESC LIMIT 1
          ) AS last_body,
          (
            SELECT direction FROM messages m2
            WHERE m2.contact_id = m.contact_id
              AND m2.channel = m.channel
              AND m2.tenant_id = ${tenantId}
            ORDER BY occurred_at DESC LIMIT 1
          ) AS last_direction,
          (
            SELECT status FROM messages m2
            WHERE m2.contact_id = m.contact_id
              AND m2.channel = m.channel
              AND m2.tenant_id = ${tenantId}
            ORDER BY occurred_at DESC LIMIT 1
          ) AS last_status,
          (
            SELECT message_type FROM messages m2
            WHERE m2.contact_id = m.contact_id
              AND m2.channel = m.channel
              AND m2.tenant_id = ${tenantId}
            ORDER BY occurred_at DESC LIMIT 1
          ) AS last_message_type,
          c.first_name,
          c.last_name,
          c.email AS contact_email,
          c.phone AS contact_phone
        FROM messages m
        JOIN contacts c ON c.id = m.contact_id
          AND c.tenant_id = ${tenantId}
        WHERE m.tenant_id = ${tenantId}
          ${channelFilter}
          AND m.contact_id IS NOT NULL
        GROUP BY m.contact_id, m.channel, c.first_name, c.last_name, c.email, c.phone
        ORDER BY last_message_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);

      return (rows as unknown[]).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          contactId: row["contact_id"] as string,
          channel: row["channel"] as string,
          lastMessageAt: row["last_message_at"] as string,
          totalMessages: Number(row["total_messages"]),
          lastBody: (row["last_body"] as string) ?? "",
          lastDirection: (row["last_direction"] as string) ?? "outbound",
          lastStatus: (row["last_status"] as string) ?? "queued",
          lastMessageType: (row["last_message_type"] as string) ?? "text",
          lastInboundAt: (row["last_inbound_at"] as string | null) ?? null,
          contactName:
            [row["first_name"], row["last_name"]].filter(Boolean).join(" ") ||
            (row["contact_email"] as string | null) ||
            (row["contact_phone"] as string | null) ||
            "Unknown",
          contactEmail: row["contact_email"] as string | null,
          contactPhone: row["contact_phone"] as string | null,
        };
      });
    }),

  /**
   * Get all messages in a thread for a given contactId + channel.
   */
  getThread: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        channel: z.enum(["email", "sms", "whatsapp"]).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const baseWhere = and(
        eq(messages.tenantId, tenantId),
        eq(messages.contactId, input.contactId),
      );

      const rows = await db
        .select()
        .from(messages)
        .where(input.channel ? and(baseWhere, eq(messages.channel, input.channel)) : baseWhere)
        .orderBy(desc(messages.occurredAt))
        .limit(input.limit);

      // Return chronological order (oldest first for chat display).
      return rows.reverse();
    }),

  getThreadContext: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        channel: z.enum(["email", "sms", "whatsapp"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const leadWhere =
        input.channel === "whatsapp"
          ? and(
              eq(leads.tenantId, tenantId),
              eq(leads.contactId, input.contactId),
              eq(leads.sourceChannel, "whatsapp"),
            )
          : and(eq(leads.tenantId, tenantId), eq(leads.contactId, input.contactId));

      const [lead] = await db
        .select({
          id: leads.id,
          workflowKind: leads.workflowKind,
          workflowState: leads.workflowState,
          sourceChannel: leads.sourceChannel,
          structuredData: leads.structuredData,
          lastAutomationAt: leads.lastAutomationAt,
          submittedAt: leads.submittedAt,
          status: leads.status,
        })
        .from(leads)
        .where(leadWhere)
        .orderBy(desc(leads.submittedAt))
        .limit(1);

      const [lastInbound] =
        input.channel === "whatsapp"
          ? await db
              .select({ occurredAt: messages.occurredAt })
              .from(messages)
              .where(
                and(
                  eq(messages.tenantId, tenantId),
                  eq(messages.contactId, input.contactId),
                  eq(messages.channel, "whatsapp"),
                  eq(messages.direction, "inbound"),
                ),
              )
              .orderBy(desc(messages.occurredAt))
              .limit(1)
          : [undefined];

      const [lastFailed] = await db
        .select({
          occurredAt: messages.occurredAt,
          errorMessage: messages.errorMessage,
        })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.contactId, input.contactId),
            eq(messages.direction, "outbound"),
            eq(messages.status, "failed"),
            input.channel ? eq(messages.channel, input.channel) : undefined,
          ),
        )
        .orderBy(desc(messages.occurredAt))
        .limit(1);

      const conversationState =
        input.channel === "whatsapp"
          ? computeWhatsappConversationState(lastInbound?.occurredAt ?? null)
          : null;

      return {
        leadId: lead?.id ?? null,
        status: lead?.status ?? null,
        workflowKind: lead?.workflowKind ?? null,
        workflowState: lead?.workflowState ?? null,
        sourceChannel: lead?.sourceChannel ?? null,
        structuredData:
          lead?.structuredData && typeof lead.structuredData === "object"
            ? (lead.structuredData as Record<string, unknown>)
            : {},
        lastAutomationAt: lead?.lastAutomationAt ?? null,
        submittedAt: lead?.submittedAt ?? null,
        lastFailureAt: lastFailed?.occurredAt ?? null,
        lastFailureMessage: lastFailed?.errorMessage ?? null,
        serviceWindow:
          conversationState && input.channel === "whatsapp"
            ? {
                open: conversationState.serviceWindowOpen,
                policy: conversationState.policy,
                lastInboundAt: conversationState.lastInboundAt,
                closesAt: conversationState.windowClosesAt,
              }
            : null,
      };
    }),

  listAutomationIssues: tenantProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(25).default(8),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [failedMessages, pendingLeads] = await Promise.all([
        db
          .select({
            messageId: messages.id,
            contactId: messages.contactId,
            channel: messages.channel,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
            contactPhone: contacts.phone,
            occurredAt: messages.occurredAt,
            errorMessage: messages.errorMessage,
            body: messages.body,
          })
          .from(messages)
          .leftJoin(
            contacts,
            and(eq(contacts.id, messages.contactId), eq(contacts.tenantId, tenantId)),
          )
          .where(
            and(
              eq(messages.tenantId, tenantId),
              inArray(messages.channel, ["whatsapp", "sms"]),
              eq(messages.direction, "outbound"),
              eq(messages.status, "failed"),
              sql`NOT (${messages.meta} ? 'inboxAttentionDismissedAt')`,
            ),
          )
          .orderBy(desc(messages.occurredAt))
          .limit(input.limit),
        db
          .select({
            leadId: leads.id,
            contactId: leads.contactId,
            workflowKind: leads.workflowKind,
            workflowState: leads.workflowState,
            submittedAt: leads.submittedAt,
            sourceChannel: leads.sourceChannel,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
            contactPhone: contacts.phone,
          })
          .from(leads)
          .leftJoin(
            contacts,
            and(eq(contacts.id, leads.contactId), eq(contacts.tenantId, tenantId)),
          )
          .where(
            and(
              eq(leads.tenantId, tenantId),
              eq(leads.sourceChannel, "whatsapp"),
              or(
                eq(leads.status, "new"),
                inArray(leads.workflowState, [
                  "missing_details",
                  "awaiting_confirmation",
                  "manual_review",
                ]),
              ),
            ),
          )
          .orderBy(desc(leads.submittedAt))
          .limit(input.limit),
      ]);

      const failedItems = failedMessages.map((row) => ({
        id: `failed:${row.messageId}`,
        type: "send_failed" as const,
        messageId: row.messageId,
        leadId: null,
        occurredAt: row.occurredAt,
        contactId: row.contactId,
        contactName:
          [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ") ||
          row.contactPhone ||
          "Unknown",
        contactPhone: row.contactPhone,
        workflowKind: null,
        workflowState: "reply_failed",
        detail: row.errorMessage ?? `${row.channel === "sms" ? "SMS" : "WhatsApp"} send failed.`,
        summary: row.body,
      }));

      const pendingItems = pendingLeads.map((row) => ({
        id: `lead:${row.leadId}`,
        type: "lead_attention" as const,
        messageId: null,
        leadId: row.leadId,
        occurredAt: row.submittedAt,
        contactId: row.contactId,
        contactName:
          [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ") ||
          row.contactPhone ||
          "Unknown",
        contactPhone: row.contactPhone,
        workflowKind: row.workflowKind ?? "generic",
        workflowState: row.workflowState ?? "received",
        detail:
          row.workflowState === "missing_details"
            ? "This request is waiting for more details."
            : row.workflowState === "awaiting_confirmation"
              ? "This request is waiting for staff confirmation."
              : row.workflowState === "manual_review"
                ? "This thread needs human review."
                : "This lead is still waiting for follow-up.",
        summary: row.sourceChannel,
      }));

      return [...failedItems, ...pendingItems]
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, input.limit);
    }),

  clearAutomationIssue: tenantProcedure
    .input(automationIssueInput)
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const now = new Date();

      if (input.type === "send_failed") {
        const dismissedMeta = JSON.stringify({ inboxAttentionDismissedAt: now.toISOString() });
        const updated = await db
          .update(messages)
          .set({
            meta: sql`${messages.meta} || ${dismissedMeta}::jsonb`,
          })
          .where(
            and(
              eq(messages.tenantId, tenantId),
              eq(messages.id, input.messageId),
              eq(messages.status, "failed"),
            ),
          )
          .returning({ id: messages.id });

        return { clearedCount: updated.length };
      }

      const updated = await db
        .update(leads)
        .set({
          status: "contacted",
          workflowState: "attention_cleared",
          lastAutomationAt: now,
        })
        .where(and(eq(leads.tenantId, tenantId), eq(leads.id, input.leadId)))
        .returning({ id: leads.id });

      return { clearedCount: updated.length };
    }),

  clearAutomationIssues: tenantProcedure
    .input(
      z.object({
        issues: z.array(automationIssueInput).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const now = new Date();
      const failedMessageIds = input.issues
        .filter(
          (issue): issue is z.infer<typeof automationIssueInput> & { type: "send_failed" } =>
            issue.type === "send_failed",
        )
        .map((issue) => issue.messageId);
      const leadIds = input.issues
        .filter(
          (issue): issue is z.infer<typeof automationIssueInput> & { type: "lead_attention" } =>
            issue.type === "lead_attention",
        )
        .map((issue) => issue.leadId);

      let clearedCount = 0;

      if (failedMessageIds.length > 0) {
        const dismissedMeta = JSON.stringify({ inboxAttentionDismissedAt: now.toISOString() });
        const updated = await db
          .update(messages)
          .set({
            meta: sql`${messages.meta} || ${dismissedMeta}::jsonb`,
          })
          .where(
            and(
              eq(messages.tenantId, tenantId),
              inArray(messages.id, failedMessageIds),
              eq(messages.status, "failed"),
            ),
          )
          .returning({ id: messages.id });
        clearedCount += updated.length;
      }

      if (leadIds.length > 0) {
        const updated = await db
          .update(leads)
          .set({
            status: "contacted",
            workflowState: "attention_cleared",
            lastAutomationAt: now,
          })
          .where(and(eq(leads.tenantId, tenantId), inArray(leads.id, leadIds)))
          .returning({ id: leads.id });
        clearedCount += updated.length;
      }

      return { clearedCount };
    }),

  deleteThread: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        channel: z.enum(["email", "sms", "whatsapp"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const deleted = await db
        .delete(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.contactId, input.contactId),
            eq(messages.channel, input.channel),
          ),
        )
        .returning({ id: messages.id });

      return { deletedCount: deleted.length };
    }),

  deleteThreads: tenantProcedure
    .input(
      z.object({
        threads: z
          .array(
            z.object({
              contactId: z.string().uuid(),
              channel: z.enum(["email", "sms", "whatsapp"]),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      let deletedCount = 0;

      await db.transaction(async (tx) => {
        for (const thread of input.threads) {
          const deleted = await tx
            .delete(messages)
            .where(
              and(
                eq(messages.tenantId, tenantId),
                eq(messages.contactId, thread.contactId),
                eq(messages.channel, thread.channel),
              ),
            )
            .returning({ id: messages.id });
          deletedCount += deleted.length;
        }
      });

      return { deletedCount };
    }),

  updateLeadWorkflowStatus: tenantProcedure
    .input(
      z.object({
        leadId: z.string().uuid(),
        status: z.enum(["new", "contacted", "confirmed", "qualified", "archived"]),
        workflowState: z.enum([
          "received",
          "missing_details",
          "awaiting_confirmation",
          "contacted",
          "confirmed",
          "declined",
          "cancelled",
          "manual_review",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [lead] = await db
        .select({
          id: leads.id,
          contactId: leads.contactId,
          workflowKind: leads.workflowKind,
          payload: leads.payload,
          structuredData: leads.structuredData,
          sourceChannel: leads.sourceChannel,
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.id, input.leadId)))
        .limit(1);

      if (!lead) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      const eventId = randomUUID();
      await db.transaction(async (tx) => {
        await tx
          .update(leads)
          .set({
            status: input.status,
            workflowState: input.workflowState,
            lastAutomationAt: new Date(),
          })
          .where(and(eq(leads.tenantId, tenantId), eq(leads.id, input.leadId)));

        if (["confirmed", "declined", "cancelled"].includes(input.workflowState)) {
          await tx
            .update(crmTasks)
            .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(crmTasks.tenantId, tenantId),
                sql`${crmTasks.meta}->>'leadId' = ${input.leadId}`,
              ),
            );
        }

        const eventPayload = reservationStatusChangedV1.parse({
          leadId: lead.id,
          contactId: lead.contactId,
          leadKind: lead.workflowKind,
          workflowState: input.workflowState,
          status: input.status,
        });
        await tx.insert(outbox).values({
          eventId,
          tenantId,
          type: "reservation.status_changed",
          payload: eventPayload,
        });
      });

      if (lead.contactId) {
        await enqueueSmsSequenceTriggerJob({
          tenantId,
          eventId,
          eventType: "reservation.status_changed",
          contactId: lead.contactId,
          leadId: lead.id,
          payload: {
            leadKind: lead.workflowKind ?? "generic",
            workflowState: input.workflowState,
            status: input.status,
          },
        });
      }

      const confirmation =
        input.workflowState === "confirmed" && lead.workflowKind === "booking"
          ? await queueReservationConfirmationSms({
              tenantId,
              leadId: lead.id,
              contactId: lead.contactId,
            })
          : { queued: false };

      return {
        leadId: lead.id,
        workflowKind: lead.workflowKind,
        workflowState: input.workflowState,
        status: input.status,
        confirmationSmsQueued: confirmation.queued,
        confirmationSmsReason: confirmation.reason ?? null,
      };
    }),

  /**
   * Send a WhatsApp reply from the dashboard (within the 24h window).
   */
  sendWhatsApp: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        toPhone: z.string().min(5).max(20),
        text: z.string().min(1).max(4096),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const { WhatsAppApiError, sendWhatsAppText } = await import("@marketing/integrations");
      const { resolveWhatsappCredentials } = await import("@marketing/integrations");
      const { env } = await import("@marketing/shared");
      const { integrationConnections } = await import("@marketing/db");

      const [contact] = await db
        .select({ id: contacts.id, phone: contacts.phone })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
      }

      const normalizePhone = (value: string | null) => value?.replace(/[\s()\-+]/g, "") ?? "";
      if (normalizePhone(contact.phone) !== normalizePhone(input.toPhone)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Phone number does not belong to this contact.",
        });
      }

      const [tenant] = await db
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantId));

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }

      // Resolve access token.
      const [conn] = await db
        .select({
          oauthTokens: integrationConnections.oauthTokens,
          meta: integrationConnections.meta,
        })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.tenantId, tenantId),
            eq(integrationConnections.provider, "meta"),
          ),
        );

      const credentials = resolveWhatsappCredentials({
        tenantSlug: tenant.slug,
        connection: conn
          ? {
              oauthTokens: conn.oauthTokens,
              meta:
                conn.meta && typeof conn.meta === "object"
                  ? (conn.meta as Record<string, unknown>)
                  : null,
            }
          : null,
        env,
      });

      if (!credentials) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "WhatsApp is not connected for this tenant.",
        });
      }

      const [lastInbound] = await db
        .select({ occurredAt: messages.occurredAt })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.contactId, input.contactId),
            eq(messages.channel, "whatsapp"),
            eq(messages.direction, "inbound"),
          ),
        )
        .orderBy(desc(messages.occurredAt))
        .limit(1);

      const conversationState = computeWhatsappConversationState(lastInbound?.occurredAt ?? null);
      if (!conversationState.serviceWindowOpen) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This WhatsApp conversation is outside the 24-hour service window. Template sending is not configured yet.",
        });
      }

      try {
        const result = await sendWhatsAppText(
          credentials.phoneNumberId,
          credentials.accessToken,
          input.toPhone,
          input.text,
        );

        await db.insert(messages).values({
          tenantId,
          contactId: input.contactId,
          channel: "whatsapp",
          direction: "outbound",
          fromAddress: credentials.phoneNumberId,
          toAddress: input.toPhone,
          body: input.text,
          messageType: "text",
          status: "sent",
          policyState: conversationState.policy,
          externalId: result.messageId,
        });

        return { messageId: result.messageId };
      } catch (error) {
        const errorMessage =
          error instanceof WhatsAppApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "WhatsApp send failed.";

        await db.insert(messages).values({
          tenantId,
          contactId: input.contactId,
          channel: "whatsapp",
          direction: "outbound",
          fromAddress: credentials.phoneNumberId,
          toAddress: input.toPhone,
          body: input.text,
          messageType: "text",
          status: "failed",
          policyState: conversationState.policy,
          errorMessage,
        });

        throw new TRPCError({
          code:
            error instanceof WhatsAppApiError && (error.status === 401 || error.code === 190)
              ? "PRECONDITION_FAILED"
              : "INTERNAL_SERVER_ERROR",
          message:
            error instanceof WhatsAppApiError && (error.status === 401 || error.code === 190)
              ? "WhatsApp authentication failed. Refresh the Meta test token or replace it with a permanent business token."
              : errorMessage,
        });
      }
    }),

  /**
   * Send an SMS reply from the dashboard through aspsms.ch.
   */
  sendSms: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        toPhone: z.string().min(5).max(20),
        text: z.string().min(1).max(459),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const { SMS_MAX_RECOMMENDED_CHARS, getSmsProviderHealth } =
        await import("@marketing/integrations");
      const { env } = await import("@marketing/shared");
      const providerHealth = getSmsProviderHealth(env);

      if (input.text.trim().length > SMS_MAX_RECOMMENDED_CHARS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `SMS replies are limited to ${SMS_MAX_RECOMMENDED_CHARS} characters.`,
        });
      }

      const [contact] = await db
        .select({ id: contacts.id, phone: contacts.phone })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
      }

      let normalizedContactPhone: string;
      let normalizedInputPhone: string;
      try {
        normalizedContactPhone = normalizeSmsPhone(contact.phone ?? "");
        normalizedInputPhone = normalizeSmsPhone(input.toPhone);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use an international phone number, for example +41761234567.",
        });
      }
      if (normalizedContactPhone !== normalizedInputPhone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Phone number does not belong to this contact.",
        });
      }

      const text = input.text.trim();
      const [message] = await db
        .insert(messages)
        .values({
          tenantId,
          contactId: input.contactId,
          channel: "sms",
          direction: "outbound",
          fromAddress: providerHealth.senderLabel,
          toAddress: normalizedInputPhone,
          body: text,
          messageType: "text",
          status: "queued",
          meta: {
            provider: providerHealth.provider,
            providerLabel: providerHealth.providerLabel,
            purpose: "manual_reply",
          },
        })
        .returning({ id: messages.id });
      if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await enqueueSmsSendJob({ tenantId, messageId: message.id });
      return {
        messageId: message.id,
        segmentCount: text.length <= 160 ? 1 : Math.ceil(text.length / 153),
        queued: true,
      };
    }),
});
