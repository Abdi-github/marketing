import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Hostnames that are the platform itself — for these we run the normal
// next-intl flow (locale-prefixed dashboard routing). Custom hostnames get
// rewritten to /p/<tenantSlug>/<pageSlug> via a server-side lookup.
function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0]!;
  if (h === "localhost") return true;
  if (h.endsWith(".vercel.app")) return true;
  if (h.endsWith(".fly.dev")) return true;
  // The configured APP_URL host. Read at module init for speed.
  const appHost = (process.env["APP_URL"] ?? "http://localhost:3000")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .split(":")[0]!;
  return h === appHost || h === `www.${appHost}`;
}

export default async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;

  // Bypass i18n for embed routes — these are iframe-embeddable pages used by
  // external sites and must never receive a locale prefix redirect.
  if (pathname.startsWith("/embed/")) {
    return NextResponse.next();
  }

  // Platform host → run next-intl middleware normally.
  if (isPlatformHost(host)) {
    return intlMiddleware(req);
  }

  // Custom hostname → fetch the tenant slug + page slug from our internal
  // lookup endpoint. The endpoint is hot-cacheable; for now this is a simple
  // HTTPS round-trip to the same app. In production we'd use a Redis-backed
  // edge cache or KV store with sub-millisecond reads.
  try {
    const lookupUrl = new URL("/api/internal/host-lookup", req.nextUrl);
    lookupUrl.searchParams.set("host", host.split(":")[0]!);
    const res = await fetch(lookupUrl, { headers: { "x-edge-lookup": "1" } });
    if (!res.ok) return NextResponse.next();
    const data = (await res.json()) as { tenantSlug?: string; defaultPageSlug?: string } | null;
    if (!data?.tenantSlug) return NextResponse.next();

    const pathname = req.nextUrl.pathname;
    // Map "/" → /p/<tenant>/<defaultPage>; "/<slug>" → /p/<tenant>/<slug>
    const pageSlug =
      pathname === "/" || pathname === ""
        ? (data.defaultPageSlug ?? "")
        : pathname.replace(/^\//, "").split("/")[0]!;

    if (!pageSlug) {
      // Tenant has no published page yet — render a generic landing.
      return NextResponse.rewrite(new URL(`/p/preview/missing-page`, req.nextUrl));
    }

    const rewriteUrl = new URL(`/p/${data.tenantSlug}/${pageSlug}`, req.nextUrl);
    // Preserve query string + tracking cookies.
    rewriteUrl.search = req.nextUrl.search;
    return NextResponse.rewrite(rewriteUrl);
  } catch {
    // Fail open — let the request through. Better to serve the wrong page
    // than to 500 every request when DNS or our DB hiccups.
    return NextResponse.next();
  }
}

export const config = {
  // Match all pathnames except:
  // - api routes (including internal lookup)
  // - Next.js internal paths
  // - static files
  // - /p/* (public landing-page render routes — locale-free, no auth, already rewritten target)
  matcher: ["/((?!api|p|_next|_vercel|.*\\..*).*)"],
};
