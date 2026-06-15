import { db } from "@marketing/db";
import { contacts, emailPreferences, emailSends, emailSuppressions } from "@marketing/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function html(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#111827;line-height:1.5"><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="color:#4b5563">${body}</p></body></html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sendId = req.nextUrl.searchParams.get("send_id") ?? "";
  if (!UUID_RE.test(sendId)) {
    return html("Unsubscribe link invalid", "This unsubscribe link is invalid or expired.", 400);
  }

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

  if (!send?.email) {
    return html("Unsubscribe link invalid", "This unsubscribe link is invalid or expired.", 404);
  }

  const now = new Date();
  const email = normalizeEmail(send.email);
  const [existingSuppression] = await db
    .select({ reason: emailSuppressions.reason })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.tenantId, send.tenantId), eq(emailSuppressions.email, email)));
  const hardSuppressed =
    existingSuppression?.reason === "bounced" || existingSuppression?.reason === "complained";

  await db.transaction(async (tx) => {
    await tx
      .insert(emailPreferences)
      .values({
        contactId: send.contactId,
        tenantId: send.tenantId,
        email,
        marketingOptIn: false,
        source: "unsubscribe_link",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailPreferences.tenantId, emailPreferences.email],
        set: {
          contactId: send.contactId,
          marketingOptIn: false,
          source: "unsubscribe_link",
          updatedAt: now,
        },
      });

    if (hardSuppressed) return;

    await tx
      .insert(emailSuppressions)
      .values({
        tenantId: send.tenantId,
        contactId: send.contactId,
        email,
        reason: "unsubscribed",
        source: "unsubscribe_link",
        suppressedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailSuppressions.tenantId, emailSuppressions.email],
        set: {
          contactId: send.contactId,
          reason: "unsubscribed",
          source: "unsubscribe_link",
          suppressedAt: now,
          updatedAt: now,
        },
      });
  });

  return html(
    "You are unsubscribed",
    "You will no longer receive marketing sequence emails from this business.",
  );
}
