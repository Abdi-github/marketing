import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const PLATFORM_ROLES = [
  "super_admin",
  "support_admin",
  "operations_admin",
  "finance_admin",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// ─── Users ────────────────────────────────────────────────────────────────────
// Not tenant-scoped: a user can belong to multiple tenants via tenant_users.
// Better-Auth maps to this table via drizzleAdapter schema config.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Platform-wide role — null for regular users, or one of PLATFORM_ROLES for operators.
  platformRole: text("platform_role"),
  // DE-CH locale default matches product strategy beachhead (ADR-0004).
  locale: text("locale").notNull().default("de-CH"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
// Carries activeTenantId — set on first login or via tenant switcher.
// HttpOnly signed cookie stores the session token, not the session id.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // token is what lives in the cookie; id is the PK
  token: text("token").notNull().unique(),
  // Active tenant for this session — null until first login with a tenant.
  activeTenantId: uuid("active_tenant_id").references(() => tenants.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Accounts ─────────────────────────────────────────────────────────────────
// Stores credential provider (email/password) and future OAuth providers.
// Better-Auth stores the hashed password in accounts.password when providerId = 'credential'.
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Verifications ────────────────────────────────────────────────────────────
// Used by Better-Auth for email-verification and password-reset tokens.
export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
