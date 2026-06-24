import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const integrationProviderEnum = pgEnum("integration_provider", [
  "gastrofix",
  "lightspeed_ch",
  "eversports",
  "bexio",
  "meta",
  "google_business",
  "resend",
  "twilio",
]);

export const integrationSyncStatusEnum = pgEnum("integration_sync_status", [
  "queued",
  "running",
  "success",
  "partial",
  "noop",
  "error",
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "connected",
  "disconnected",
  "error",
  "token_expired",
]);

// ─── integration_connections ──────────────────────────────────────────────────
// One row per (tenant_id, provider, external_account_id).
// oauth_tokens: AES-256-GCM encrypted JSON blob (see packages/integrations/src/crypto.ts).
// meta: provider-specific non-secret extra data validated by the adapter.
// webhook_events is NOT duplicated here — use billing.webhookEvents (generic, shared).

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    externalAccountId: text("external_account_id").notNull().default("default"),
    /** AES-256-GCM encrypted JSON blob — use encryptTokens/decryptTokens. */
    oauthTokens: text("oauth_tokens").notNull(),
    scopes: text("scopes").array().notNull().default([]),
    status: connectionStatusEnum("status").notNull().default("connected"),
    meta: jsonb("meta").notNull().default({}),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("integration_connections_tenant_id_idx").on(t.tenantId),
    tenantProviderAccountUniq: uniqueIndex(
      "integration_connections_tenant_provider_account_unique",
    ).on(t.tenantId, t.provider, t.externalAccountId),
  }),
);

export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert;

export const integrationSyncRuns = pgTable(
  "integration_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    externalAccountId: text("external_account_id").notNull().default("default"),
    status: integrationSyncStatusEnum("status").notNull().default("queued"),
    source: text("source").notNull().default("manual"),
    recordsProcessed: integer("records_processed").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("integration_sync_runs_tenant_id_idx").on(t.tenantId),
    connectionCreatedIdx: index("integration_sync_runs_connection_created_idx").on(
      t.connectionId,
      t.createdAt,
    ),
    providerCreatedIdx: index("integration_sync_runs_provider_created_idx").on(
      t.tenantId,
      t.provider,
      t.createdAt,
    ),
  }),
);

export type IntegrationSyncRun = typeof integrationSyncRuns.$inferSelect;
export type NewIntegrationSyncRun = typeof integrationSyncRuns.$inferInsert;
