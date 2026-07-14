import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { accounts, db, sessions, users } from "@marketing/db";
import { env } from "@marketing/shared";
import { verify as argon2Verify } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import type { NextResponse } from "next/server";

export type ManualEmailSignInResult = {
  token: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export class InvalidEmailSignInError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidEmailSignInError";
  }
}

export async function createManualEmailSession(input: {
  email: string;
  password: string;
  request: Request;
}): Promise<ManualEmailSignInResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || !password) throw new InvalidEmailSignInError();

  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      passwordHash: accounts.password,
    })
    .from(users)
    .innerJoin(accounts, eq(accounts.userId, users.id))
    .where(and(eq(users.email, email), eq(accounts.providerId, "credential")))
    .limit(1);

  if (!row?.passwordHash) throw new InvalidEmailSignInError();

  const valid = await argon2Verify(row.passwordHash, password);
  if (!valid) throw new InvalidEmailSignInError();

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  const requestHeaders = input.request.headers;

  await db.insert(sessions).values({
    id: randomUUID(),
    userId: row.userId,
    token,
    expiresAt,
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      null,
    userAgent: requestHeaders.get("user-agent"),
    createdAt: now,
    updatedAt: now,
  });

  return {
    token,
    expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
    },
  };
}

export function attachManualSessionCookies(
  response: NextResponse,
  session: ManualEmailSignInResult,
) {
  const secure = process.env["NODE_ENV"] === "production";
  const signedToken = signCookieValue(session.token);
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: session.expiresAt,
  };

  response.cookies.set("better-auth.session_token", signedToken, cookieOptions);

  if (secure) {
    response.cookies.set("__Secure-better-auth.session_token", signedToken, cookieOptions);
  }
}

function signCookieValue(value: string): string {
  // Better Auth 1.6 signs session cookies with standard padded base64.
  // base64url produces a valid HMAC but Better Auth will reject its encoding.
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET).update(value).digest("base64");
  return `${value}.${signature}`;
}
