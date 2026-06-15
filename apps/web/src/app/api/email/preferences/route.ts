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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRequestIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 20px;color:#111827;line-height:1.5;background:#f9fafb"><main style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:28px;box-shadow:0 16px 40px rgba(15,23,42,.08)"><h1 style="font-size:26px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</main></body></html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

async function resolveSend(sendId: string) {
  const [send] = await db
    .select({
      tenantId: emailSends.tenantId,
      contactId: emailSends.contactId,
      email: contacts.email,
      firstName: contacts.firstName,
    })
    .from(emailSends)
    .innerJoin(
      contacts,
      and(eq(contacts.id, emailSends.contactId), eq(contacts.tenantId, emailSends.tenantId)),
    )
    .where(eq(emailSends.id, sendId));

  return send?.email ? { ...send, email: normalizeEmail(send.email) } : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sendId = req.nextUrl.searchParams.get("send_id") ?? "";
  if (!UUID_RE.test(sendId)) {
    return page(
      "Preference link invalid",
      '<p style="color:#4b5563">This preference link is invalid or expired.</p>',
      400,
    );
  }

  const send = await resolveSend(sendId);
  if (!send) {
    return page(
      "Preference link invalid",
      '<p style="color:#4b5563">This preference link is invalid or expired.</p>',
      404,
    );
  }

  const [[preference], [suppression]] = await Promise.all([
    db
      .select({ marketingOptIn: emailPreferences.marketingOptIn })
      .from(emailPreferences)
      .where(
        and(eq(emailPreferences.tenantId, send.tenantId), eq(emailPreferences.email, send.email)),
      ),
    db
      .select({ reason: emailSuppressions.reason })
      .from(emailSuppressions)
      .where(
        and(eq(emailSuppressions.tenantId, send.tenantId), eq(emailSuppressions.email, send.email)),
      ),
  ]);

  const hardSuppressed = suppression?.reason === "bounced" || suppression?.reason === "complained";
  const optedIn = hardSuppressed
    ? false
    : (preference?.marketingOptIn ?? suppression?.reason !== "unsubscribed");
  const disabled = hardSuppressed ? " disabled" : "";
  const checked = optedIn ? " checked" : "";

  return page(
    "Email preferences",
    `<p style="color:#4b5563;margin:0 0 20px">Manage marketing emails for <strong>${escapeHtml(send.email)}</strong>.</p>
    ${
      hardSuppressed
        ? '<p style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:12px;margin:0 0 16px">This address cannot be resubscribed from this page because a delivery failure or spam complaint was recorded.</p>'
        : ""
    }
    <form method="post" style="display:grid;gap:18px">
      <input type="hidden" name="send_id" value="${escapeHtml(sendId)}">
      <label style="display:flex;gap:12px;align-items:flex-start;font-size:16px">
        <input type="checkbox" name="marketing_opt_in" value="1"${checked}${disabled} style="margin-top:4px">
        <span><strong>Receive marketing emails</strong><br><span style="color:#6b7280;font-size:14px">Product updates, offers, event invitations, and helpful follow-ups from this business.</span></span>
      </label>
      <button type="submit"${disabled} style="border:0;border-radius:10px;background:#2563eb;color:white;font-weight:700;padding:12px 16px;width:max-content;cursor:pointer;opacity:${hardSuppressed ? "0.45" : "1"}">Save preferences</button>
    </form>`,
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const sendId = String(form.get("send_id") ?? "");
  if (!UUID_RE.test(sendId)) {
    return page(
      "Preference link invalid",
      '<p style="color:#4b5563">This preference link is invalid or expired.</p>',
      400,
    );
  }

  const send = await resolveSend(sendId);
  if (!send) {
    return page(
      "Preference link invalid",
      '<p style="color:#4b5563">This preference link is invalid or expired.</p>',
      404,
    );
  }

  const [hardSuppression] = await db
    .select({ reason: emailSuppressions.reason })
    .from(emailSuppressions)
    .where(
      and(eq(emailSuppressions.tenantId, send.tenantId), eq(emailSuppressions.email, send.email)),
    );

  const hardSuppressed =
    hardSuppression?.reason === "bounced" || hardSuppression?.reason === "complained";
  if (hardSuppressed) {
    return page(
      "Preferences unchanged",
      '<p style="color:#4b5563">This address cannot be resubscribed from this page because a delivery failure or spam complaint was recorded.</p>',
      409,
    );
  }

  const marketingOptIn = form.get("marketing_opt_in") === "1";
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(emailPreferences)
      .values({
        tenantId: send.tenantId,
        contactId: send.contactId,
        email: send.email,
        marketingOptIn,
        source: "preference_center",
        updatedFromIp: getRequestIp(req),
        updatedFromUserAgent: req.headers.get("user-agent"),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [emailPreferences.tenantId, emailPreferences.email],
        set: {
          contactId: send.contactId,
          marketingOptIn,
          source: "preference_center",
          updatedFromIp: getRequestIp(req),
          updatedFromUserAgent: req.headers.get("user-agent"),
          updatedAt: now,
        },
      });

    if (marketingOptIn) {
      await tx
        .delete(emailSuppressions)
        .where(
          and(
            eq(emailSuppressions.tenantId, send.tenantId),
            eq(emailSuppressions.email, send.email),
            eq(emailSuppressions.reason, "unsubscribed"),
          ),
        );
    } else {
      await tx
        .insert(emailSuppressions)
        .values({
          tenantId: send.tenantId,
          contactId: send.contactId,
          email: send.email,
          reason: "unsubscribed",
          source: "preference_center",
          suppressedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [emailSuppressions.tenantId, emailSuppressions.email],
          set: {
            contactId: send.contactId,
            reason: "unsubscribed",
            source: "preference_center",
            suppressedAt: now,
            updatedAt: now,
          },
        });
    }
  });

  return page(
    "Preferences saved",
    `<p style="color:#4b5563">Your marketing email preference is now <strong>${marketingOptIn ? "enabled" : "disabled"}</strong>.</p>`,
  );
}
