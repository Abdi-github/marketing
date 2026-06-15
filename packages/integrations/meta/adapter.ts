import { createHmac } from "crypto";
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
import {
  exchangeCode,
  getLongLivedToken,
  getPages,
  getIgUserId,
  publishToFbPage,
  publishPhotoToFbPage,
  publishToIg,
} from "./client";
import { META_SCOPES } from "./config";

export type MetaTokens = {
  userAccessToken: string;
  pageAccessToken: string;
  pageId: string;
  pageName: string;
  igUserId: string | null;
};

export type PublishResult = {
  fbPostId: string | null;
  igMediaId: string | null;
};

export class MetaAdapter implements IIntegrationAdapter {
  readonly provider = "meta" as const;
  readonly authType = "oauth2" as const;

  constructor(
    private readonly db: Database,
    private readonly encKey: string,
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly redirectUri: string,
  ) {}

  /**
   * Build the Facebook OAuth dialog URL.
   * State is HMAC-signed to prevent CSRF: `{tenantId}.{nonce}.{hmac}`.
   */
  buildOAuthUrl(tenantId: string): string {
    const nonce = Math.random().toString(36).slice(2);
    const payload = `${tenantId}.${nonce}`;
    const hmac = createHmac("sha256", this.appSecret).update(payload).digest("hex").slice(0, 16);
    const state = `${payload}.${hmac}`;

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: META_SCOPES.join(","),
      response_type: "code",
      state,
    });

    return `https://www.facebook.com/dialog/oauth?${params.toString()}`;
  }

  /** Verify CSRF state and extract tenantId. Returns null if invalid. */
  verifyState(state: string): string | null {
    const parts = state.split(".");
    if (parts.length !== 3) return null;
    const [tenantId, nonce, receivedHmac] = parts as [string, string, string];
    const payload = `${tenantId}.${nonce}`;
    const expectedHmac = createHmac("sha256", this.appSecret)
      .update(payload)
      .digest("hex")
      .slice(0, 16);
    if (receivedHmac !== expectedHmac) return null;
    return tenantId;
  }

  /**
   * Exchange authorization code for tokens, fetch pages + IG account,
   * and upsert the integration_connections row.
   */
  async connect(ctx: TenantContext, creds: ConnectCredentials): Promise<IntegrationConnection> {
    if (!creds.authorizationCode) throw new Error("Meta connect requires authorizationCode");

    // 1. Short-lived → long-lived user token
    const shortToken = await exchangeCode(
      creds.authorizationCode,
      this.redirectUri,
      this.appId,
      this.appSecret,
    );
    const userAccessToken = await getLongLivedToken(shortToken, this.appId, this.appSecret);

    // 2. Get managed pages — use the first one
    const pages = await getPages(userAccessToken);
    if (pages.length === 0)
      throw new Error("No Facebook pages found. Create a Facebook Page before connecting.");
    const page = pages[0]!;

    // 3. Check for linked Instagram account (best-effort — fails gracefully without IG scopes)
    const igUserId = await getIgUserId(page.id, page.access_token).catch(() => null);

    // 4. Encrypt and store
    const tokens: MetaTokens = {
      userAccessToken,
      pageAccessToken: page.access_token,
      pageId: page.id,
      pageName: page.name,
      igUserId,
    };

    const [row] = await this.db
      .insert(integrationConnections)
      .values({
        tenantId: ctx.tenantId,
        provider: "meta",
        externalAccountId: page.id,
        oauthTokens: encryptTokens(tokens as unknown as Record<string, unknown>, this.encKey),
        scopes: META_SCOPES,
        status: "connected",
        meta: {
          pageName: page.name,
          pageId: page.id,
          igConnected: igUserId !== null,
          igUserId,
        },
      })
      .onConflictDoUpdate({
        target: [
          integrationConnections.tenantId,
          integrationConnections.provider,
          integrationConnections.externalAccountId,
        ],
        set: {
          oauthTokens: encryptTokens(tokens as unknown as Record<string, unknown>, this.encKey),
          scopes: META_SCOPES,
          status: "connected",
          meta: {
            pageName: page.name,
            pageId: page.id,
            igConnected: igUserId !== null,
            igUserId,
          },
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info(
      { tenantId: ctx.tenantId, pageId: page.id, igConnected: igUserId !== null },
      "[meta] connected",
    );

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

  async sync(_ctx: TenantContext, _connection: IntegrationConnection): Promise<SyncResult> {
    // Meta is push-only — we publish to them, they don't push data to us.
    return { outcome: "noop", recordsProcessed: 0 };
  }

  /**
   * Publish a social post to the connected Facebook page and (if IG is linked
   * and an image URL is provided) to Instagram.
   *
   * Instagram requires a publicly accessible image; FB supports text-only.
   */
  async publishPost(
    connection: IntegrationConnection,
    text: string,
    imageUrl?: string | null,
  ): Promise<PublishResult> {
    const tokens = decryptTokens(connection.oauthTokens, this.encKey) as unknown as MetaTokens;
    const result: PublishResult = { fbPostId: null, igMediaId: null };

    // Facebook Page post — use photo endpoint when an image is available.
    try {
      result.fbPostId = imageUrl
        ? await publishPhotoToFbPage(tokens.pageId, tokens.pageAccessToken, text, imageUrl)
        : await publishToFbPage(tokens.pageId, tokens.pageAccessToken, text);
      logger.info(
        { pageId: tokens.pageId, fbPostId: result.fbPostId, withImage: !!imageUrl },
        "[meta] published to Facebook",
      );
    } catch (err) {
      logger.error({ err }, "[meta] Facebook publish failed");
      throw err;
    }

    // Instagram post (requires image)
    if (tokens.igUserId && imageUrl) {
      try {
        result.igMediaId = await publishToIg(
          tokens.igUserId,
          tokens.pageAccessToken,
          text,
          imageUrl,
        );
        logger.info(
          { igUserId: tokens.igUserId, igMediaId: result.igMediaId },
          "[meta] published to Instagram",
        );
      } catch (err) {
        // IG failure is non-fatal — FB post is already up
        logger.error({ err }, "[meta] Instagram publish failed (FB succeeded)");
      }
    }

    return result;
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
