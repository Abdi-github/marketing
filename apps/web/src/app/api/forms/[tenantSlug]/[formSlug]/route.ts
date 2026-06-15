// Public lead-capture form endpoint. No auth required.
// Anti-spam: honeypot field (__hp) + optional Cloudflare Turnstile (__cf_turnstile).
// Rate-limited at the middleware layer (IP-based).
// See docs/WORKFLOWS.md §Lead capture.
import { db } from "@marketing/db";
import { forms, leads, tenants, outbox, contacts, crmTasks } from "@marketing/db";
import { logger } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateAndSanitizeFormPayload } from "../../../../../lib/form-validation";

export const dynamic = "force-dynamic";

type Params = Promise<{ tenantSlug: string; formSlug: string }>;

function buildLeadFollowUpDueAt(now = new Date()): Date {
  const dueAt = new Date(now);
  dueAt.setHours(dueAt.getHours() + 4);
  return dueAt;
}

// ─── Turnstile verification ────────────────────────────────────────────────────

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) return true; // Skip verification if not configured

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// ─── Required field validator ──────────────────────────────────────────────────

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Params },
): Promise<NextResponse> {
  const { tenantSlug, formSlug } = await params;

  // 1. Resolve tenant by slug.
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2. Resolve active form by (tenant_id, slug).
  const [form] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.tenantId, tenant.id), eq(forms.slug, formSlug), eq(forms.isActive, true)));

  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 3. Parse body.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 4. Honeypot check — return 200 silently to fool bots.
  const settings = (form.settings ?? {}) as { honeypot?: boolean; turnstile_enabled?: boolean };
  if (settings.honeypot !== false) {
    const hp = body["__hp"];
    if (typeof hp === "string" && hp.length > 0) {
      // Bot detected — pretend success
      return NextResponse.json({ ok: true }, { status: 200 });
    }
  }

  // 5. Turnstile verification (if enabled on this form + secret configured).
  if (settings.turnstile_enabled === true) {
    const token = typeof body["__cf_turnstile"] === "string" ? body["__cf_turnstile"] : "";
    if (!token) {
      return NextResponse.json({ error: "Anti-spam challenge required" }, { status: 422 });
    }
    const valid = await verifyTurnstile(token);
    if (!valid) {
      return NextResponse.json({ error: "Anti-spam challenge failed" }, { status: 422 });
    }
  }

  // 6. Strip internal fields before storing.
  const payload: Record<string, unknown> = { ...body };
  delete payload["__hp"];
  delete payload["__cf_turnstile"];

  // 7. Validate and sanitize fields before storing or creating CRM contacts.
  const validation = validateAndSanitizeFormPayload(payload, form);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.errors.map((err) => err.message).join(", "),
        fields: validation.errors,
      },
      { status: 422 },
    );
  }
  const sanitizedPayload = validation.payload;

  // 8. Insert lead + CRM contact + outbox event in one transaction.
  const sourceUrl = req.headers.get("referer") ?? undefined;

  try {
    await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          tenantId: tenant.id,
          formId: form.id,
          payload: sanitizedPayload,
          sourceUrl,
        })
        .returning({ id: leads.id });

      // CRM dedup: find-or-create contact by email, then link the lead.
      let capturedContactId: string | null = null;
      const rawEmail = sanitizedPayload["email"];
      if (typeof rawEmail === "string" && rawEmail.trim()) {
        const email = rawEmail.toLowerCase().trim();

        const [existing] = await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));

        let contactId: string;
        if (existing) {
          await tx
            .update(contacts)
            .set({ lastSeenAt: new Date(), updatedAt: new Date() })
            .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, existing.id)));
          contactId = existing.id;
        } else {
          const rawName =
            typeof sanitizedPayload["name"] === "string" ? sanitizedPayload["name"].trim() : "";
          const spaceIdx = rawName.indexOf(" ");
          const firstName = spaceIdx > -1 ? rawName.slice(0, spaceIdx) : rawName || null;
          const lastName = spaceIdx > -1 ? rawName.slice(spaceIdx + 1) || null : null;
          const phone =
            typeof sanitizedPayload["phone"] === "string"
              ? sanitizedPayload["phone"].trim() || null
              : null;

          const [newContact] = await tx
            .insert(contacts)
            .values({ tenantId: tenant.id, email, firstName, lastName, phone, source: "form" })
            .returning({ id: contacts.id });
          contactId = newContact!.id;
        }

        await tx
          .update(leads)
          .set({ contactId })
          .where(and(eq(leads.tenantId, tenant.id), eq(leads.id, lead!.id)));

        capturedContactId = contactId;

        await tx.insert(crmTasks).values({
          tenantId: tenant.id,
          contactId,
          title: `Follow up new ${form.name} lead`,
          body: sourceUrl
            ? `New form submission from ${form.name}. Source: ${sourceUrl}`
            : `New form submission from ${form.name}.`,
          dueAt: buildLeadFollowUpDueAt(),
          priority: "high",
        });
      }

      await tx.insert(outbox).values({
        tenantId: tenant.id,
        type: "lead.captured",
        payload: {
          leadId: lead!.id,
          formId: form.id,
          tenantId: tenant.id,
          formSlug,
          contactId: capturedContactId,
        },
      });
    });
  } catch (err) {
    logger.error({ err: String(err), tenantSlug, formSlug }, "[form] insert failed");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // 9. Return success — never echo PII back.
  return NextResponse.json({ ok: true }, { status: 200 });
}
