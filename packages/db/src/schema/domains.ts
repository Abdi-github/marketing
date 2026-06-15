// step-32+: Custom domains.
// Lets a tenant claim multiple hostnames (e.g., cafebern.ch, www.cafebern.ch, pages.cafebern.ch).
// Each domain is independently verified (TXT) + cert-issued (Let's Encrypt). The hostname →
// tenant lookup happens in the Next.js middleware on every request to a non-platform host.

import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const domainStatusEnum = pgEnum("domain_status", [
  "pending_verification", // DNS records not yet seen
  "verified", // TXT record found, requesting cert
  "cert_pending", // ACME order in flight
  "live", // Cert installed, traffic routes
  "failed", // Verification or cert issuance gave up
  "removed", // Soft-deleted by user
]);

export type DomainStatus = (typeof domainStatusEnum.enumValues)[number];

export const customDomains = pgTable(
  "custom_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Lowercased hostname, globally unique across all tenants. */
    hostname: text("hostname").notNull().unique(),
    /** Random token the tenant adds to `_marketing-verify.<hostname>` TXT to prove ownership. */
    verifyToken: text("verify_token").notNull(),
    status: domainStatusEnum("status").notNull().default("pending_verification"),
    certIssuedAt: timestamp("cert_issued_at", { withTimezone: true }),
    certExpiresAt: timestamp("cert_expires_at", { withTimezone: true }),
    lastDnsCheckAt: timestamp("last_dns_check_at", { withTimezone: true }),
    lastDnsCheckError: text("last_dns_check_error"),
    /** When true, this hostname is used for canonical URLs + sharing. At most one per tenant. */
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("custom_domains_tenant_idx").on(t.tenantId),
  }),
);

export type CustomDomain = typeof customDomains.$inferSelect;
export type NewCustomDomain = typeof customDomains.$inferInsert;
