// Unified inbox router (step-29).
// Threads = grouped messages per contact per channel.
import { db } from "@marketing/db";
import { contacts, messages } from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
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
      const { sendWhatsAppText } = await import("@marketing/integrations");
      const { env } = await import("@marketing/shared");
      const { integrationConnections } = await import("@marketing/db");
      const { decryptTokens } = await import("@marketing/integrations");

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

      // Resolve access token.
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
        throw new Error("WhatsApp not connected");
      }

      const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? "";
      const result = await sendWhatsAppText(phoneNumberId, accessToken, input.toPhone, input.text);

      await db.insert(messages).values({
        tenantId,
        contactId: input.contactId,
        channel: "whatsapp",
        direction: "outbound",
        fromAddress: phoneNumberId,
        toAddress: input.toPhone,
        body: input.text,
        status: "sent",
        externalId: result.messageId,
      });

      return { messageId: result.messageId };
    }),
});
