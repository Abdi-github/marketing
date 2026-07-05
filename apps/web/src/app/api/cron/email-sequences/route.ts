import { processEmailSequenceTick } from "@/server/email-sequence-tick";
import { env } from "@marketing/shared";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (env.CRON_SECRET) {
    return authHeader === `Bearer ${env.CRON_SECRET}`;
  }

  if (env.NODE_ENV !== "production") return true;

  // Vercel Cron adds this header for scheduled calls. A CRON_SECRET is still
  // recommended for external schedulers and stricter production environments.
  return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processEmailSequenceTick();
  return NextResponse.json({ ok: true, ...result });
}
