import { auth } from "@marketing/auth";
import { logger } from "@marketing/shared";
import { buildTenantContext } from "@marketing/tenancy";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type SessionWithToken = {
  session?: {
    token?: string;
  };
};

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    const token = (session as SessionWithToken | null)?.session?.token;

    if (!session || !token) {
      return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
    }

    const tenantCtx = await buildTenantContext(token);

    if (!tenantCtx) {
      return NextResponse.json({ ok: false, reason: "no_tenant" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      "[auth] Session readiness check failed",
    );

    return NextResponse.json({ ok: false, reason: "session_check_failed" }, { status: 503 });
  }
}
