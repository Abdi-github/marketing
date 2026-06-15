// Internal hostname → tenant lookup used by the middleware to route custom
// domains to /p/<tenantSlug>/<pageSlug>. NOT a public endpoint — restricted
// by the x-edge-lookup header (only the middleware sets it).
//
// Hot path: every request to a custom domain hits this. Cache TTL 60s in-memory.

import { db, customDomains, tenants, landingPages } from "@marketing/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CacheEntry = { tenantSlug: string; defaultPageSlug: string | null; cachedAt: number };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function GET(req: Request) {
  // Reject calls that didn't come from our middleware.
  if (req.headers.get("x-edge-lookup") !== "1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const host = (new URL(req.url).searchParams.get("host") ?? "").toLowerCase();
  if (!host) return NextResponse.json({ error: "missing host" }, { status: 400 });

  // Cache check.
  const cached = CACHE.get(host);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) {
    return NextResponse.json({
      tenantSlug: cached.tenantSlug,
      defaultPageSlug: cached.defaultPageSlug,
    });
  }

  // Look up the domain. The partial index makes this fast.
  // We bypass RLS here (admin connection) because the lookup is system-level —
  // the middleware needs to know about other tenants' domains to route requests.
  const rows = await db.execute(sql`
    SELECT t.slug AS tenant_slug, t.id AS tenant_id
    FROM ${customDomains} cd
    JOIN ${tenants} t ON t.id = cd.tenant_id
    WHERE cd.hostname = ${host} AND cd.status = 'live'
    LIMIT 1
  `);

  const row =
    (rows as unknown as { rows: Array<{ tenant_slug: string; tenant_id: string }> }).rows?.[0] ??
    (rows as unknown as Array<{ tenant_slug: string; tenant_id: string }>)[0];

  if (!row) {
    return NextResponse.json({ tenantSlug: null });
  }

  // Find a default page for this tenant — first published page by recency.
  const [defaultPage] = await db
    .select({ slug: landingPages.slug })
    .from(landingPages)
    .where(and(eq(landingPages.tenantId, row.tenant_id), eq(landingPages.status, "published")))
    .orderBy(desc(landingPages.publishedAt))
    .limit(1);

  const entry: CacheEntry = {
    tenantSlug: row.tenant_slug,
    defaultPageSlug: defaultPage?.slug ?? null,
    cachedAt: Date.now(),
  };
  CACHE.set(host, entry);

  return NextResponse.json({
    tenantSlug: entry.tenantSlug,
    defaultPageSlug: entry.defaultPageSlug,
  });
}
