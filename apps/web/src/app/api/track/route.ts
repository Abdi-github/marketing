// Public behavioral event tracking endpoint. No auth required.
// Called by /public/track.js embedded in landing pages.
// FADP compliance: no IP stored; country_code from CF-IPCountry header only.
// Consent: tracker only fires after visitor accepts consent banner.
// ADR-0022: Behavioral event retention (18-month rolling window).
import { db, events, tenants } from "@marketing/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const EVENT_TYPES = [
  "page_view",
  "scroll_50",
  "scroll_90",
  "time_30s",
  "form_view",
  "form_start",
  "form_step_view",
  "form_step_complete",
  "form_abandon",
  "form_submit",
  "cta_click",
  "email_open",
  "email_click",
] as const;

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  pageUrl: z.string().max(2000).optional(),
  referrer: z.string().max(2000).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  /** Tenant's public slug, validated server-side. */
  t: z.string().min(1).max(80),
  /** First-party UUID cookie, never tied to real-world identity. */
  aid: z.string().uuid(),
  events: z.array(eventSchema).min(1).max(50),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 422 });
  }

  const { t: tenantSlug, aid: anonymousId, events: eventBatch } = parsed.data;

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) {
    // Return 200 to avoid leaking tenant existence to scanners.
    return NextResponse.json({ ok: true });
  }

  const countryCode = req.headers.get("cf-ipcountry") ?? undefined;

  const rows = eventBatch.map((e) => ({
    tenantId: tenant.id,
    anonymousId,
    eventType: e.type,
    properties: e.properties ?? {},
    pageUrl: e.pageUrl ?? null,
    referrer: e.referrer ?? null,
    countryCode: countryCode ?? null,
  }));

  try {
    // Await the write: serverless runtimes may stop work after the response is returned.
    await db.insert(events).values(rows);
  } catch (error) {
    console.warn("Public tracking event insert failed", error);
    return NextResponse.json({ ok: true, stored: false });
  }

  return NextResponse.json({ ok: true, stored: true });
}

// Handle OPTIONS for CORS preflight, used when tracker runs on another origin.
export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
