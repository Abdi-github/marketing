import { auth } from "@marketing/auth";
import { logger } from "@marketing/shared";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

const handlers = toNextJsHandler(auth);

function safeLocale(value: unknown): string {
  const locale = typeof value === "string" ? value : "en";
  return /^(de|en|fr|it)(-[A-Z]{2})?$/.test(locale) ? locale : "en";
}

function copySetCookieHeaders(source: Response, target: NextResponse) {
  const headers = source.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.() ?? [];

  if (cookies.length > 0) {
    for (const cookie of cookies) target.headers.append("set-cookie", cookie);
    return;
  }

  const cookie = source.headers.get("set-cookie");
  if (cookie) target.headers.append("set-cookie", cookie);
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const locale = safeLocale(formData.get("locale"));
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const origin = new URL(req.url).origin;

  try {
    const headers = new Headers(req.headers);
    headers.set("content-type", "application/json");

    const signInRequest = new Request(new URL("/api/auth/sign-in/email", origin), {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });

    const signInResponse = await handlers.POST(signInRequest);

    if (!signInResponse.ok) {
      return NextResponse.redirect(new URL(`/${locale}/login?error=invalid`, origin), 303);
    }

    const redirect = NextResponse.redirect(new URL(`/${locale}/dashboard`, origin), 303);
    copySetCookieHeaders(signInResponse, redirect);
    return redirect;
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      "[auth] Fallback login route failed",
    );

    return NextResponse.redirect(new URL(`/${locale}/login?error=server`, origin), 303);
  }
}
