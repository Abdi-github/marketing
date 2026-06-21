// Public lead-capture form endpoint. No auth required.
// Anti-spam: honeypot field (__hp) + optional Cloudflare Turnstile (__cf_turnstile).
// Rate-limited at the middleware layer (IP-based).
// See docs/WORKFLOWS.md §Lead capture.
import { db } from "@marketing/db";
import { forms, leads, tenants, outbox, contacts, crmTasks, events } from "@marketing/db";
import {
  buildLeadTaskDueAt,
  buildLeadWorkflowPlan,
  buildPhoneLeadPlaceholderEmail,
  logger,
  splitContactName,
} from "@marketing/shared";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateAndSanitizeFormPayload } from "../../../../../lib/form-validation";
import { enqueueLeadFollowUpJob } from "../../../../../server/queues/lead-followup";

export const dynamic = "force-dynamic";

type Params = Promise<{ tenantSlug: string; formSlug: string }>;

function firstStringValue(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseWorkflowState(
  workflowKind: "booking" | "callback" | "quote" | "generic",
  payload: Record<string, unknown>,
): string {
  if (workflowKind !== "booking") return "received";
  const hasDate = Boolean(firstStringValue(payload, ["date", "reservation_date"]));
  const hasTime = Boolean(firstStringValue(payload, ["time", "reservation_time"]));
  const hasPartySize = Boolean(firstStringValue(payload, ["party_size", "guest_count", "guests"]));
  return hasDate && hasTime && hasPartySize ? "awaiting_confirmation" : "missing_details";
}

function buildStructuredLeadData(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    name: firstStringValue(payload, ["name", "full_name"]),
    email: firstStringValue(payload, ["email"]),
    phone: firstStringValue(payload, ["phone", "telephone", "mobile"]),
    message: firstStringValue(payload, ["message", "notes", "comment", "details"]),
    reservationDate: firstStringValue(payload, ["date", "reservation_date"]),
    reservationTime: firstStringValue(payload, ["time", "reservation_time"]),
    partySize: firstStringValue(payload, ["party_size", "guest_count", "guests"]),
  };
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
  const anonymousId = req.cookies.get("__tid")?.value ?? null;
  const workflowPlan = buildLeadWorkflowPlan(form, sanitizedPayload, sourceUrl);
  const contactName = splitContactName(sanitizedPayload);
  let createdLeadId: string | null = null;

  try {
    await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          tenantId: tenant.id,
          formId: form.id,
          payload: sanitizedPayload,
          workflowKind: workflowPlan.kind,
          workflowState: parseWorkflowState(workflowPlan.kind, sanitizedPayload),
          sourceChannel: form.landingPageId ? "landing_page_form" : "form",
          structuredData: buildStructuredLeadData(sanitizedPayload),
          sourceUrl,
        })
        .returning({ id: leads.id });
      createdLeadId = lead?.id ?? null;

      // CRM dedup: find-or-create contact by email, then link the lead.
      let capturedContactId: string | null = null;
      const rawEmail = sanitizedPayload["email"];
      const rawPhone =
        typeof sanitizedPayload["phone"] === "string"
          ? sanitizedPayload["phone"].trim() || null
          : null;
      const email =
        typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.toLowerCase().trim() : null;
      const placeholderEmail = rawPhone ? buildPhoneLeadPlaceholderEmail(rawPhone) : null;

      if (email || rawPhone) {
        const [existingByEmail] = email
          ? await tx
              .select({
                id: contacts.id,
                email: contacts.email,
                firstName: contacts.firstName,
                lastName: contacts.lastName,
                phone: contacts.phone,
                lifecycleStage: contacts.lifecycleStage,
              })
              .from(contacts)
              .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)))
          : [];

        const [existingByPhone] =
          !existingByEmail && rawPhone
            ? await tx
                .select({
                  id: contacts.id,
                  email: contacts.email,
                  firstName: contacts.firstName,
                  lastName: contacts.lastName,
                  phone: contacts.phone,
                  lifecycleStage: contacts.lifecycleStage,
                })
                .from(contacts)
                .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.phone, rawPhone)))
                .limit(1)
            : [];

        const existingContact = existingByEmail ?? existingByPhone ?? null;
        let contactId: string | null = existingContact?.id ?? null;
        if (contactId) {
          const shouldAdoptRealEmail =
            email && existingContact?.email === placeholderEmail && email !== existingContact.email;

          await tx
            .update(contacts)
            .set({
              email: shouldAdoptRealEmail ? email : (existingContact?.email ?? email ?? undefined),
              firstName: existingContact?.firstName ?? contactName.firstName,
              lastName: existingContact?.lastName ?? contactName.lastName,
              phone: existingContact?.phone ?? rawPhone,
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
        } else if (email || placeholderEmail) {
          const [newContact] = await tx
            .insert(contacts)
            .values({
              tenantId: tenant.id,
              email: email ?? placeholderEmail!,
              firstName: contactName.firstName,
              lastName: contactName.lastName,
              phone: rawPhone,
              source: workflowPlan.kind === "callback" || (rawPhone && !email) ? "phone" : "form",
            })
            .returning({ id: contacts.id });
          contactId = newContact?.id ?? null;
        }

        if (contactId) {
          await tx
            .update(leads)
            .set({ contactId })
            .where(and(eq(leads.tenantId, tenant.id), eq(leads.id, lead!.id)));

          capturedContactId = contactId;

          await tx.insert(crmTasks).values({
            tenantId: tenant.id,
            contactId,
            title: workflowPlan.title,
            body: workflowPlan.body,
            meta: {
              sourceChannel: form.landingPageId ? "landing_page_form" : "form",
              workflowKind: workflowPlan.kind,
              workflowState: parseWorkflowState(workflowPlan.kind, sanitizedPayload),
              leadId: lead!.id,
              structuredData: buildStructuredLeadData(sanitizedPayload),
            },
            dueAt: buildLeadTaskDueAt(workflowPlan),
            priority: workflowPlan.priority,
          });

          if (anonymousId) {
            await tx
              .update(events)
              .set({ contactId })
              .where(
                and(
                  eq(events.tenantId, tenant.id),
                  eq(events.anonymousId, anonymousId),
                  isNull(events.contactId),
                ),
              );
          }
        }
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
          phone: rawPhone,
          leadKind: workflowPlan.kind,
          lifecycleStage: "lead",
        },
      });
    });
  } catch (err) {
    logger.error({ err: String(err), tenantSlug, formSlug }, "[form] insert failed");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  if (createdLeadId) {
    await enqueueLeadFollowUpJob({ tenantId: tenant.id, leadId: createdLeadId }).catch((err) => {
      logger.warn(
        { err: String(err), tenantId: tenant.id, leadId: createdLeadId },
        "[form] follow-up job enqueue failed",
      );
    });
  }

  // 9. Return success — never echo PII back.
  return NextResponse.json({ ok: true }, { status: 200 });
}
