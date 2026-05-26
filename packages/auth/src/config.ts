import { db } from "@marketing/db";
import { accounts, sessions, users, verifications } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

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
    // Email sending deferred to step-10 (Resend integration).
    // Email sending deferred to step-10 (Resend). Log URL so dev flows work without SMTP.
    sendResetPassword: async ({ url }: { url: string }) => {
      logger.info({ event: "auth.password_reset_url", url }, "password-reset URL (dev only — replace with Resend in step-10)");
    },
    sendEmailVerification: async ({ url }: { url: string }) => {
      logger.info({ event: "auth.email_verification_url", url }, "email-verification URL (dev only — replace with Resend in step-10)");
    },
  },

  advanced: {
    // Use UUID4 for all IDs — consistent with our Postgres uuid columns.
    generateId: () => crypto.randomUUID(),
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
