// Public lead-capture form endpoint. No auth required.
// Anti-spam: honeypot field (__hp) + optional Cloudflare Turnstile (__cf_turnstile).
// Rate-limited at the middleware layer (IP-based).
// See docs/WORKFLOWS.md §Lead capture.
import { db } from "@marketing/db";
import { forms, leads, tenants, outbox, contacts } from "@marketing/db";
import { logger } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ tenantSlug: string; formSlug: string }>;

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

function getMissingRequired(
  payload: Record<string, unknown>,
  form: { schema: unknown; steps: unknown },
): string[] {
  // Smart form mode: required fields are declared per-field in steps
  if (Array.isArray(form.steps)) {
    const missing: string[] = [];
    for (const step of form.steps as Array<{ fields: Array<{ name: string; required?: boolean }> }>) {
      for (const field of step.fields ?? []) {
        if (field.required && !payload[field.name]) {
          missing.push(field.name);
        }
      }
    }
    return missing;
  }

  // Legacy mode: required comes from schema.required array
  const schemaObj = form.schema as Record<string, unknown>;
  const required = Array.isArray(schemaObj["required"]) ? (schemaObj["required"] as string[]) : [];
  return required.filter((k) => !(k in payload) || payload[k] === undefined || payload[k] === "");
}

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
    .where(
      and(
        eq(forms.tenantId, tenant.id),
        eq(forms.slug, formSlug),
        eq(forms.isActive, true),
      ),
    );

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

  // 7. Validate required fields.
  const missing = getMissingRequired(payload, form);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 422 },
    );
  }

  // 8. Insert lead + outbox event in a transaction.
  const sourceUrl = req.headers.get("referer") ?? undefined;

  try {
    await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          tenantId: tenant.id,
          formId: form.id,
          payload,
          sourceUrl,
        })
        .returning({ id: leads.id });

      await tx.insert(outbox).values({
        tenantId: tenant.id,
        type: "lead.captured",
        payload: {
          leadId: lead!.id,
          formId: form.id,
          tenantId: tenant.id,
          formSlug,
        },
      });

      // CRM dedup: find-or-create contact by email, then link the lead.
      const rawEmail = payload["email"];
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
            .where(eq(contacts.id, existing.id));
          contactId = existing.id;
        } else {
          const rawName = typeof payload["name"] === "string" ? payload["name"].trim() : "";
          const spaceIdx = rawName.indexOf(" ");
          const firstName = spaceIdx > -1 ? rawName.slice(0, spaceIdx) : rawName || null;
          const lastName = spaceIdx > -1 ? rawName.slice(spaceIdx + 1) || null : null;
          const phone = typeof payload["phone"] === "string" ? payload["phone"].trim() || null : null;

          const [newContact] = await tx
            .insert(contacts)
            .values({ tenantId: tenant.id, email, firstName, lastName, phone, source: "form" })
            .returning({ id: contacts.id });
          contactId = newContact!.id;
        }

        await tx
          .update(leads)
          .set({ contactId })
          .where(eq(leads.id, lead!.id));
      }
    });
  } catch (err) {
    logger.error({ err: String(err), tenantSlug, formSlug }, "[form] insert failed");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // 9. Return success — never echo PII back.
  return NextResponse.json({ ok: true }, { status: 200 });
}
