import { auth } from "@marketing/auth";
import { db } from "@marketing/db";
import { buildTenantContext } from "@marketing/tenancy";
import { env } from "@marketing/shared";
import { MetaAdapter } from "@marketing/integrations";
import { NextResponse } from "next/server";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // User denied access on Facebook dialog
  if (errorParam) {
    return NextResponse.redirect(new URL("/en/integrations?meta=denied", url.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/en/integrations?meta=error&reason=missing_params", url.origin),
    );
  }

  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;
  const encKey = env.INTEGRATION_ENCRYPTION_KEY;

  if (!appId || !appSecret || !encKey) {
    return NextResponse.redirect(
      new URL("/en/integrations?meta=error&reason=not_configured", url.origin),
    );
  }

  const redirectUri = `${env.APP_URL}/api/integrations/meta/callback`;
  const adapter = new MetaAdapter(db, encKey, appId, appSecret, redirectUri);

  // Verify CSRF state — extracts tenantId
  const tenantId = adapter.verifyState(state);
  if (!tenantId) {
    return NextResponse.redirect(
      new URL("/en/integrations?meta=error&reason=invalid_state", url.origin),
    );
  }

  // Authenticate user and verify they belong to this tenant
  const session = await auth.api.getSession({ headers: new Headers(req.headers) });
  if (!session) {
    return NextResponse.redirect(new URL("/en/login", url.origin));
  }

  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token);
  if (!tenantCtx || tenantCtx.tenantId !== tenantId) {
    return NextResponse.redirect(
      new URL("/en/integrations?meta=error&reason=tenant_mismatch", url.origin),
    );
  }

  try {
    await adapter.connect(tenantCtx, { authorizationCode: code });
    return NextResponse.redirect(new URL("/en/integrations?meta=connected", url.origin));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[meta/callback] connect failed:", msg);
    return NextResponse.redirect(
      new URL(`/en/integrations?meta=error&reason=${encodeURIComponent(msg)}`, url.origin),
    );
  }
}
