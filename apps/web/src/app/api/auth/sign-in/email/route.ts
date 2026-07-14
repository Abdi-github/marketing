import {
  attachManualSessionCookies,
  createManualEmailSession,
  InvalidEmailSignInError,
} from "../../../../../server/auth/manual-email-sign-in";
import { logger } from "@marketing/shared";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    const session = await createManualEmailSession({ email, password, request: req });
    const response = NextResponse.json({
      user: session.user,
      redirect: false,
    });
    attachManualSessionCookies(response, session);
    return response;
  } catch (error) {
    if (error instanceof InvalidEmailSignInError) {
      return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
    }

    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      "[auth] Manual email sign-in failed",
    );

    return NextResponse.json({ message: "Login failed. Please try again." }, { status: 500 });
  }
}
