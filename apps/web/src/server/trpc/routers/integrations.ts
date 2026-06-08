import { db } from "@marketing/db";
import { integrationConnections, socialPosts, outbox } from "@marketing/db";
import { eq, and } from "drizzle-orm";
import {
  GastrofixAdapter,
  LightspeedChAdapter,
  EversportsAdapter,
  MetaAdapter,
} from "@marketing/integrations";
import { env } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure, requires } from "../trpc";

// ─── Adapter instances ─────────────────────────────────────────────────────────

function getAdapter(provider: string) {
  const encKey = env.INTEGRATION_ENCRYPTION_KEY;
  if (!encKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "INTEGRATION_ENCRYPTION_KEY is not configured",
    });
  }
  switch (provider) {
    case "gastrofix":
      return new GastrofixAdapter(db, encKey);
    case "lightspeed_ch":
      return new LightspeedChAdapter(db, encKey);
    case "eversports":
      return new EversportsAdapter(db, encKey);
    default:
      throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown provider: ${provider}` });
  }
}

function getMetaAdapter(): MetaAdapter {
  const encKey = env.INTEGRATION_ENCRYPTION_KEY;
  const appId = env.META_APP_ID;
  const appSecret = env.META_APP_SECRET;
  const appUrl = env.APP_URL;

  if (!encKey || !appId || !appSecret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Meta integration is not configured (META_APP_ID, META_APP_SECRET, INTEGRATION_ENCRYPTION_KEY required)",
    });
  }

  const redirectUri = `${appUrl}/api/integrations/meta/callback`;
  return new MetaAdapter(db, encKey, appId, appSecret, redirectUri);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const integrationsRouter = router({
  /** List all integration connections for the current tenant. */
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: integrationConnections.id,
        provider: integrationConnections.provider,
        externalAccountId: integrationConnections.externalAccountId,
        status: integrationConnections.status,
        scopes: integrationConnections.scopes,
        meta: integrationConnections.meta,
        connectedAt: integrationConnections.connectedAt,
        lastSyncAt: integrationConnections.lastSyncAt,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.tenantId, ctx.tenantCtx.tenantId));

    return rows;
  }),

  /** Connect a provider (API-key path). Admin+ only. */
  connect: requires("admin")
    .input(
      z.object({
        provider: z.enum(["gastrofix", "lightspeed_ch", "eversports"]),
        apiKey: z.string().min(8),
        externalAccountId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adapter = getAdapter(input.provider);
      const connection = await adapter.connect(ctx.tenantCtx, {
        apiKey: input.apiKey,
        externalAccountId: input.externalAccountId,
      });

      await db.insert(outbox).values({
        tenantId: ctx.tenantCtx.tenantId,
        type: "integration.connected",
        payload: {
          provider: input.provider,
          connectionId: connection.id,
          externalAccountId: connection.externalAccountId,
        },
      });

      return { id: connection.id, status: connection.status };
    }),

  /** Disconnect a provider connection. Admin+ only. */
  disconnect: requires("admin")
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.query.integrationConnections.findFirst({
        where: and(
          eq(integrationConnections.id, input.connectionId),
          eq(integrationConnections.tenantId, ctx.tenantCtx.tenantId),
        ),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
      }
      const adapter = row.provider === "meta" ? getMetaAdapter() : getAdapter(row.provider);
      await adapter.disconnect(ctx.tenantCtx, input.connectionId);
      return { ok: true };
    }),

  /** Trigger a manual sync. Admin+ only. */
  sync: requires("admin")
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.query.integrationConnections.findFirst({
        where: and(
          eq(integrationConnections.id, input.connectionId),
          eq(integrationConnections.tenantId, ctx.tenantCtx.tenantId),
        ),
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
      }
      const adapter = row.provider === "meta" ? getMetaAdapter() : getAdapter(row.provider);
      const connection = {
        id: row.id,
        tenantId: row.tenantId,
        provider: row.provider,
        externalAccountId: row.externalAccountId,
        oauthTokens: row.oauthTokens,
        scopes: row.scopes ?? [],
        status: row.status as "connected" | "disconnected" | "error" | "token_expired",
        meta: (row.meta ?? {}) as Record<string, unknown>,
        connectedAt: row.connectedAt,
        lastSyncAt: row.lastSyncAt ?? null,
        updatedAt: row.updatedAt,
      };
      const result = await adapter.sync(ctx.tenantCtx, connection);
      return result;
    }),

  /**
   * Return the Facebook OAuth URL for the current tenant.
   * The frontend redirects the user to this URL to start the OAuth flow.
   * Admin+ only.
   */
  getMetaOAuthUrl: requires("admin").query(({ ctx }) => {
    const adapter = getMetaAdapter();
    const oauthUrl = adapter.buildOAuthUrl(ctx.tenantCtx.tenantId);
    return { url: oauthUrl };
  }),

  /**
   * Publish a completed social post to the tenant's connected Facebook page
   * (and Instagram, if the image URL is available and IG is linked).
   * Admin+ only.
   */
  publishToMeta: requires("admin")
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      // Fetch the post by jobId (the unique identifier the UI tracks)
      const [post] = await db
        .select({
          id: socialPosts.id,
          generatedText: socialPosts.generatedText,
          imageUrl: socialPosts.imageUrl,
          status: socialPosts.status,
          metaPostId: socialPosts.metaPostId,
        })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (post.status !== "completed" || !post.generatedText) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Post is not yet completed" });
      }
      if (post.metaPostId) {
        throw new TRPCError({ code: "CONFLICT", message: "Post is already published to Meta" });
      }

      // Find active Meta connection
      const [conn] = await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.tenantId, tenantId),
            eq(integrationConnections.provider, "meta"),
            eq(integrationConnections.status, "connected"),
          ),
        );

      if (!conn) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No active Meta connection. Connect your Facebook page first.",
        });
      }

      const adapter = getMetaAdapter();
      const connection = {
        id: conn.id,
        tenantId: conn.tenantId,
        provider: conn.provider,
        externalAccountId: conn.externalAccountId,
        oauthTokens: conn.oauthTokens,
        scopes: conn.scopes ?? [],
        status: conn.status as "connected" | "disconnected" | "error" | "token_expired",
        meta: (conn.meta ?? {}) as Record<string, unknown>,
        connectedAt: conn.connectedAt,
        lastSyncAt: conn.lastSyncAt ?? null,
        updatedAt: conn.updatedAt,
      };

      const result = await adapter.publishPost(connection, post.generatedText, post.imageUrl);

      // Persist publish result
      await db
        .update(socialPosts)
        .set({
          metaPostId: result.fbPostId,
          igMediaId: result.igMediaId,
          publishedToMetaAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.id, post.id)));

      const connMeta = connection.meta as { igConnected?: boolean };
      return {
        fbPostId: result.fbPostId,
        igMediaId: result.igMediaId,
        igSkipped: connMeta.igConnected && !post.imageUrl,
      };
    }),
});
