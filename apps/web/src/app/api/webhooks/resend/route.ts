// Resend webhook handler (step-26).
// Processes: email.sent, email.delivered, email.opened, email.clicked,
//            email.bounced, email.complained.
// Updates email_sends status + timestamps.
// Verified via Resend-Signature header (when RESEND_WEBHOOK_SECRET is set).
// Docs: https://resend.com/docs/dashboard/webhooks/introduction
import { db } from "@marketing/db";
import { contacts, emailPreferences, emailSends, emailSuppressions, events } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// ─── Signature verification ───────────────────────────────────────────────────

function verifyResendSignature(
  rawBody: string,
  svix_id: string,
  svix_ts: string,
  svix_sig: string,
): boolean {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // Unverified in dev — accept all.

  const toSign = `${svix_id}.${svix_ts}.${rawBody}`;
  const expectedSig = createHmac("sha256", Buffer.from(secret.replace("whsec_", ""), "base64"))
    .update(toSign)
    .digest("base64");

  const sigs = svix_sig
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter((s): s is string => Boolean(s));
  return sigs.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expectedSig, "base64"));
    } catch {
      return false;
    }
  });
}

// ─── Event handler ────────────────────────────────────────────────────────────

interface ResendWebhookPayload {
  type: string;
  data: {
    email_id?: string;
    tags?: Array<{ name: string; value: string }>;
  };
}

function getTag(
  tags: Array<{ name: string; value: string }> | undefined,
  name: string,
): string | undefined {
  return tags?.find((t) => t.name === name)?.value;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

async function suppressSendContact(
  sendId: string,
  reason: "bounced" | "complained",
  type: string,
): Promise<void> {
  const [send] = await db
    .select({
      tenantId: emailSends.tenantId,
      contactId: emailSends.contactId,
      email: contacts.email,
    })
    .from(emailSends)
    .innerJoin(
      contacts,
      and(eq(contacts.id, emailSends.contactId), eq(contacts.tenantId, emailSends.tenantId)),
    )
    .where(eq(emailSends.id, sendId));

  if (!send?.email) return;

  const now = new Date();
  const email = normalizeEmail(send.email);

  await db.transaction(async (tx) => {
    await tx
      .insert(emailPreferences)
      .values({
        contactId: send.contactId,
        tenantId: send.tenantId,
        email,
        marketingOptIn: false,
        source: "resend_webhook",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailPreferences.tenantId, emailPreferences.email],
        set: {
          contactId: send.contactId,
          marketingOptIn: false,
          source: "resend_webhook",
          updatedAt: now,
        },
      });

    await tx
      .insert(emailSuppressions)
      .values({
        tenantId: send.tenantId,
        contactId: send.contactId,
        email,
        reason,
        source: "resend_webhook",
        resendEventType: type,
        suppressedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailSuppressions.tenantId, emailSuppressions.email],
        set: {
          contactId: send.contactId,
          reason,
          source: "resend_webhook",
          resendEventType: type,
          suppressedAt: now,
          updatedAt: now,
        },
      });
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();

  // Signature verification.
  const svix_id = req.headers.get("svix-id") ?? "";
  const svix_ts = req.headers.get("svix-timestamp") ?? "";
  const svix_sig = req.headers.get("svix-signature") ?? "";

  if (!verifyResendSignature(rawBody, svix_id, svix_ts, svix_sig)) {
    logger.warn("[resend-webhook] invalid signature");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const { type, data } = payload;
  const tags = data.tags;
  const sendId = getTag(tags, "send_id");
  const tenantId = getTag(tags, "tenant_id");

  // Only process events we tagged ourselves (ignore unrelated Resend traffic).
  if (!sendId) {
    logger.debug({ type }, "[resend-webhook] no send_id tag — ignoring");
    return new Response("OK", { status: 200 });
  }

  try {
    const now = new Date();

    if (type === "email.delivered") {
      await db.update(emailSends).set({ status: "delivered" }).where(eq(emailSends.id, sendId));
    } else if (type === "email.opened") {
      await db
        .update(emailSends)
        .set({ openedAt: now, status: "delivered" })
        .where(eq(emailSends.id, sendId));

      // Emit email_open event for lead scoring (step-25 events table).
      if (tenantId) {
        const [send] = await db
          .select({ contactId: emailSends.contactId })
          .from(emailSends)
          .where(eq(emailSends.id, sendId));

        if (send?.contactId) {
          await db
            .insert(events)
            .values({
              tenantId,
              contactId: send.contactId,
              anonymousId: `email:${sendId}`,
              eventType: "email_open",
              properties: { send_id: sendId },
              occurredAt: now,
            })
            .catch(() => {}); // fire-and-forget; don't fail the webhook
        }
      }
    } else if (type === "email.clicked") {
      await db.update(emailSends).set({ clickedAt: now }).where(eq(emailSends.id, sendId));

      if (tenantId) {
        const [send] = await db
          .select({ contactId: emailSends.contactId })
          .from(emailSends)
          .where(eq(emailSends.id, sendId));

        if (send?.contactId) {
          await db
            .insert(events)
            .values({
              tenantId,
              contactId: send.contactId,
              anonymousId: `email:${sendId}`,
              eventType: "email_click",
              properties: { send_id: sendId },
              occurredAt: now,
            })
            .catch(() => {});
        }
      }
    } else if (type === "email.bounced") {
      await db.update(emailSends).set({ status: "bounced" }).where(eq(emailSends.id, sendId));
      await suppressSendContact(sendId, "bounced", type);
    } else if (type === "email.complained") {
      await db.update(emailSends).set({ status: "complained" }).where(eq(emailSends.id, sendId));
      await suppressSendContact(sendId, "complained", type);
    }

    logger.debug({ type, sendId }, "[resend-webhook] processed");
  } catch (err) {
    logger.error({ err: String(err), type, sendId }, "[resend-webhook] processing error");
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
