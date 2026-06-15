import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tenants } from "./tenants";

// ─── Locale enum — CH beachhead locales (ADR-0014 D2 + step-17) ─────────────
// Expansion order: de-CH → fr-CH → it-CH (this step); DE/AT deferred to Phase 9+.
export const localeCodeEnum = pgEnum("locale_code", ["de-CH", "fr-CH", "it-CH", "en"]);
export type LocaleCode = (typeof localeCodeEnum.enumValues)[number];

// ─── Role enum ────────────────────────────────────────────────────────────────
export const tenantRoleEnum = pgEnum("tenant_role", ["owner", "admin", "editor", "viewer"]);

// ─── tenant_users ─────────────────────────────────────────────────────────────
// add-tenant-table: tenant_id NOT NULL + index + FK + RLS in migration.
// Composite PK (tenant_id, user_id) — one role per membership, not per resource.
export const tenantUsers = pgTable(
  "tenant_users",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: tenantRoleEnum("role").notNull().default("editor"),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId], name: "tenant_users_pk" }),
    index("tenant_users_tenant_id_idx").on(t.tenantId),
  ],
);

// ─── business_profile ─────────────────────────────────────────────────────────
// add-tenant-table: tenant_id NOT NULL + index + FK + RLS in migration.
// One profile per tenant — enforced by UNIQUE(tenant_id).
// vertical is free text — any SME type is valid (web agency, tattoo studio, café…).
export const businessProfiles = pgTable(
  "business_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vertical: text("vertical").notNull(),
    locale: localeCodeEnum("locale").notNull().default("de-CH"),
    businessName: text("business_name").notNull(),
    addressStreet: text("address_street"),
    addressCity: text("address_city"),
    addressPostalCode: text("address_postal_code"),
    addressCountry: text("address_country").notNull().default("CH"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("business_profiles_tenant_id_idx").on(t.tenantId)],
);

export type TenantUser = typeof tenantUsers.$inferSelect;
export type NewTenantUser = typeof tenantUsers.$inferInsert;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type NewBusinessProfile = typeof businessProfiles.$inferInsert;
export type TenantRole = (typeof tenantRoleEnum.enumValues)[number];
