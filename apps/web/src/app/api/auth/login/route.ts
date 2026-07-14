import {
  attachManualSessionCookies,
  createManualEmailSession,
  InvalidEmailSignInError,
} from "../../../../server/auth/manual-email-sign-in";
import { logger } from "@marketing/shared";
import { NextResponse } from "next/server";

function safeLocale(value: unknown): string {
  const locale = typeof value === "string" ? value : "en";
  return /^(de|en|fr|it)(-[A-Z]{2})?$/.test(locale) ? locale : "en";
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const locale = safeLocale(formData.get("locale"));
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const origin = new URL(req.url).origin;

  try {
    const session = await createManualEmailSession({ email, password, request: req });
    const redirect = NextResponse.redirect(new URL(`/${locale}/dashboard`, origin), 303);
    attachManualSessionCookies(redirect, session);
    return redirect;
  } catch (error) {
    if (error instanceof InvalidEmailSignInError) {
      return NextResponse.redirect(new URL(`/${locale}/login?error=invalid`, origin), 303);
    }

    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      "[auth] Fallback login route failed",
    );

    return NextResponse.redirect(new URL(`/${locale}/login?error=server`, origin), 303);
  }
}
