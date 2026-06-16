import { db } from "@marketing/db";
import { accounts, sessions, users, verifications } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

// Must match the params used in packages/auth/src/signup.ts atomicSignup.
const ARGON2_PARAMS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

// In development, accept any localhost port so the dev server (which may start
// on 3001/3002/etc. if 3000 is occupied) can still complete the auth handshake.
const devTrustedOrigins =
  process.env["NODE_ENV"] !== "production"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
      ]
    : [];

function toTrustedOrigin(value: string | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

const trustedOrigins = Array.from(
  new Set(
    [
      ...devTrustedOrigins,
      env.BETTER_AUTH_URL,
      env.APP_URL,
      process.env["VERCEL_URL"],
      process.env["VERCEL_BRANCH_URL"],
      process.env["VERCEL_PROJECT_PRODUCTION_URL"],
    ]
      .map(toTrustedOrigin)
      .filter((value): value is string => Boolean(value)),
  ),
);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    password: {
      hash: (password: string) => argon2Hash(password, ARGON2_PARAMS),
      verify: ({ hash, password }: { hash: string; password: string }) =>
        argon2Verify(hash, password),
    },
    // Email sending deferred to step-10 (Resend integration).
    sendResetPassword: async ({ url }: { url: string }) => {
      logger.info(
        { event: "auth.password_reset_url", url },
        "password-reset URL (dev only — replace with Resend in step-10)",
      );
    },
    sendEmailVerification: async ({ url }: { url: string }) => {
      logger.info(
        { event: "auth.email_verification_url", url },
        "email-verification URL (dev only — replace with Resend in step-10)",
      );
    },
  },

  advanced: {
    // Tell Better-Auth that Postgres owns UUID generation via DEFAULT gen_random_uuid().
    // This prevents the adapter factory from falling back to generateId() (32-char base62)
    // which would fail the uuid column type check.
    database: {
      generateId: "uuid",
    },
    useSecureCookies: env.NODE_ENV === "production",
  },

  user: {
    additionalFields: {
      platformRole: { type: "string" as const, nullable: true, defaultValue: null },
      locale: { type: "string" as const, defaultValue: "de-CH" },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      activeTenantId: { type: "string" as const, nullable: true, defaultValue: null },
    },
  },
});

export type Auth = typeof auth;
