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
} from "../src/interface";
import { createLightspeedClient } from "./client";
import { LIGHTSPEED_SCOPES } from "./config";

export class LightspeedChAdapter implements IIntegrationAdapter {
  readonly provider = "lightspeed_ch" as const;
  readonly authType = "api_key" as const;

  constructor(
    private readonly db: Database,
    private readonly encKey: string,
  ) {}

  async connect(ctx: TenantContext, creds: ConnectCredentials): Promise<IntegrationConnection> {
    if (!creds.apiKey) throw new Error("Lightspeed CH connect requires an API key");

    const externalAccountId = creds.externalAccountId ?? "default";
    const tokens = encryptTokens(
      { api_key: creds.apiKey, location_id: externalAccountId },
      this.encKey,
    );

    const [row] = await this.db
      .insert(integrationConnections)
      .values({
        tenantId: ctx.tenantId,
        provider: "lightspeed_ch",
        externalAccountId,
        oauthTokens: tokens,
        scopes: LIGHTSPEED_SCOPES,
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
    const locationId = (tokens.location_id as string) ?? connection.externalAccountId;
    if (!apiKey) throw new Error("Lightspeed connection missing api_key");

    const client = createLightspeedClient(apiKey, locationId);

    try {
      const [categories, items] = await Promise.all([
        client.listCategories(),
        client.listItems(),
      ]);

      await this.db
        .update(integrationConnections)
        .set({
          lastSyncAt: new Date(),
          meta: { categoryCount: categories.length, itemCount: items.length },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(integrationConnections.id, connection.id),
            eq(integrationConnections.tenantId, ctx.tenantId),
          ),
        );

      const count = categories.length + items.length;
      logger.info(
        { tenantId: ctx.tenantId, provider: "lightspeed_ch", connectionId: connection.id, count },
        "[lightspeed-ch] sync completed",
      );
      return { outcome: "ok", recordsProcessed: count };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        { tenantId: ctx.tenantId, provider: "lightspeed_ch", connectionId: connection.id, err: errorMessage },
        "[lightspeed-ch] sync failed",
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

  // Lightspeed CH REST API does not expose webhooks at MVP; sync is poll-based.

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
