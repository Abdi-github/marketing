import { eq, and } from "drizzle-orm";
import type { Database } from "@marketing/db";
import { integrationConnections } from "@marketing/db";
import type { TenantContext } from "@marketing/tenancy";
import { logger } from "@marketing/shared";
import { encryptTokens, decryptTokens } from "../src/crypto";
import type {
  ConnectCredentials,
  IIntegrationAdapter,
  IntegrationConnection,
  SyncResult,
  WebhookEvent,
} from "../src/interface";
import { createEversportsClient } from "./client";
import { verifyEversportsSignature } from "./webhook";
import { EVERSPORTS_SCOPES } from "./config";

export class EversportsAdapter implements IIntegrationAdapter {
  readonly provider = "eversports" as const;
  readonly authType = "api_key" as const;

  constructor(
    private readonly db: Database,
    private readonly encKey: string,
  ) {}

  async connect(ctx: TenantContext, creds: ConnectCredentials): Promise<IntegrationConnection> {
    if (!creds.apiKey) throw new Error("Eversports connect requires an API key");

    const tokens = encryptTokens({ api_key: creds.apiKey }, this.encKey);
    const externalAccountId = creds.externalAccountId ?? "default";

    const [row] = await this.db
      .insert(integrationConnections)
      .values({
        tenantId: ctx.tenantId,
        provider: "eversports",
        externalAccountId,
        oauthTokens: tokens,
        scopes: EVERSPORTS_SCOPES,
        status: "connected",
        meta: {},
      })
      .onConflictDoUpdate({
        target: [
          integrationConnections.tenantId,
          integrationConnections.provider,
          integrationConnections.externalAccountId,
        ],
        set: { oauthTokens: tokens, status: "connected", updatedAt: new Date() },
      })
      .returning();

    return this.mapRow(row!);
  }

  async disconnect(ctx: TenantContext, connectionId: string): Promise<void> {
    await this.db
      .update(integrationConnections)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.tenantId, ctx.tenantId),
        ),
      );
  }

  async sync(ctx: TenantContext, connection: IntegrationConnection): Promise<SyncResult> {
    const tokens = decryptTokens(connection.oauthTokens, this.encKey);
    const apiKey = tokens.api_key as string;
    if (!apiKey) throw new Error("Eversports connection missing api_key");

    const client = createEversportsClient(apiKey);
    const today = new Date().toISOString().split("T")[0]!;
    const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0]!;

    try {
      const activities = await client.listActivities(today, nextWeek);

      await this.db
        .update(integrationConnections)
        .set({
          lastSyncAt: new Date(),
          meta: { activityCount: activities.length },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationConnections.id, connection.id),
            eq(integrationConnections.tenantId, ctx.tenantId),
          ),
        );

      logger.info(
        { tenantId: ctx.tenantId, provider: "eversports", connectionId: connection.id, count: activities.length },
        "[eversports] sync completed",
      );
      return { outcome: "ok", recordsProcessed: activities.length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { tenantId: ctx.tenantId, provider: "eversports", connectionId: connection.id, err: errorMessage },
        "[eversports] sync failed",
      );
      await this.db
        .update(integrationConnections)
        .set({ status: "error", updatedAt: new Date() })
        .where(
          and(
            eq(integrationConnections.id, connection.id),
            eq(integrationConnections.tenantId, ctx.tenantId),
          ),
        );
      return { outcome: "error", recordsProcessed: 0, errorMessage };
    }
  }

  verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
    return verifyEversportsSignature(rawBody, signature, secret);
  }

  async processWebhookEvent(ctx: TenantContext, event: WebhookEvent): Promise<void> {
    const { processEversportsEvent } = await import("./handlers");
    await processEversportsEvent(ctx, event, this.db);
  }

  private mapRow(row: typeof integrationConnections.$inferSelect): IntegrationConnection {
    return {
      id: row.id,
      tenantId: row.tenantId,
      provider: row.provider,
      externalAccountId: row.externalAccountId,
      oauthTokens: row.oauthTokens,
      scopes: row.scopes ?? [],
      status: row.status as IntegrationConnection["status"],
      meta: (row.meta ?? {}) as Record<string, unknown>,
      connectedAt: row.connectedAt,
      lastSyncAt: row.lastSyncAt ?? null,
      updatedAt: row.updatedAt,
    };
  }
}
