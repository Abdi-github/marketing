// Unified inbox router (step-29).
// Threads = grouped messages per contact per channel.
import { db } from "@marketing/db";
import { contacts, leads, messages, tenants } from "@marketing/db";
import { computeWhatsappConversationState } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";

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
            contactId: messages.contactId,
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
              eq(messages.channel, "whatsapp"),
              eq(messages.direction, "outbound"),
              eq(messages.status, "failed"),
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
        id: `failed:${row.contactId ?? "unknown"}:${new Date(row.occurredAt).getTime()}`,
        type: "send_failed" as const,
        occurredAt: row.occurredAt,
        contactId: row.contactId,
        contactName:
          [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ") ||
          row.contactPhone ||
          "Unknown",
        contactPhone: row.contactPhone,
        workflowKind: null,
        workflowState: "reply_failed",
        detail: row.errorMessage ?? "WhatsApp send failed.",
        summary: row.body,
      }));

      const pendingItems = pendingLeads.map((row) => ({
        id: `lead:${row.leadId}`,
        type: "lead_attention" as const,
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
});
