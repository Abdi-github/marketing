import { db } from "@marketing/db";
import {
  businessProfiles,
  integrationConnections,
  integrationSyncRuns,
  messages,
  outbox,
  smsPhoneVerifications,
  socialPosts,
  tenants,
  usageRecords,
} from "@marketing/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getPlanCaps, smsUsageMonthStart } from "@marketing/billing";
import {
  GastrofixAdapter,
  LightspeedChAdapter,
  EversportsAdapter,
  MetaAdapter,
  decryptTokens,
  encryptTokens,
  getWhatsAppTestModeConfig,
  getWhatsAppTestModeIssues,
  isWhatsAppTestModeTenant,
  resolveWhatsappCredentials,
  getSmsProviderHealth,
  resolveSmsCredentials,
  isSmsTestModeTenant,
  sendWhatsAppText,
  WhatsAppApiError,
} from "@marketing/integrations";
import {
  env,
  evaluateSmsEntitlement,
  normalizeSmsPhone,
  summarizeWhatsappConnectionHealth,
} from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  absolutizeSocialCreativeUrl,
  getSocialCreativePublicUrl,
} from "../../../lib/social-creative";
import { enqueueIntegrationSyncJob } from "../../queues/integration-sync";
import { enqueueSmsSendJob } from "../../queues/sms";
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
      message:
        "Meta integration is not configured (META_APP_ID, META_APP_SECRET, INTEGRATION_ENCRYPTION_KEY required)",
    });
  }

  const redirectUri = `${appUrl}/api/integrations/meta/callback`;
  return new MetaAdapter(db, encKey, appId, appSecret, redirectUri);
}

async function resolveSmsForTenant(tenantId: string) {
  const [[tenant], [connection], [monthlyUsage]] = await Promise.all([
    db
      .select({ slug: tenants.slug, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select({
        oauthTokens: integrationConnections.oauthTokens,
        meta: integrationConnections.meta,
      })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.tenantId, tenantId),
          eq(integrationConnections.provider, "twilio"),
          eq(integrationConnections.status, "connected"),
        ),
      )
      .limit(1),
    db
      .select({ total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int` })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          eq(usageRecords.metric, "sms_sent"),
          sql`${usageRecords.recordedAt} >= ${smsUsageMonthStart()}`,
        ),
      ),
  ]);
  if (!tenant) return null;
  const demoModeAllowed = isSmsTestModeTenant(env, tenant.slug);
  const providerConfigured = Boolean(connection) || getSmsProviderHealth(env).configured;
  const entitlement = evaluateSmsEntitlement({
    monthlyLimit: getPlanCaps(tenant.plan).monthlySmsLimit,
    monthlyUsed: Number(monthlyUsage?.total ?? 0),
    providerConfigured,
    demoModeAllowed,
  });
  const credentials = resolveSmsCredentials({
    tenantSlug: tenant.slug,
    connection: connection
      ? {
          oauthTokens: connection.oauthTokens,
          meta:
            connection.meta && typeof connection.meta === "object"
              ? (connection.meta as Record<string, unknown>)
              : null,
        }
      : null,
    env,
    allowPlatformManaged: entitlement.allowed,
  });
  return { credentials, entitlement, tenant, demoModeAllowed };
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

  /** Recent sync runs for the current tenant, newest first. */
  listSyncRuns: tenantProcedure
    .input(
      z.object({
        connectionId: z.string().uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters = [eq(integrationSyncRuns.tenantId, ctx.tenantCtx.tenantId)];
      if (input.connectionId) {
        filters.push(eq(integrationSyncRuns.connectionId, input.connectionId));
      }

      return db
        .select({
          id: integrationSyncRuns.id,
          connectionId: integrationSyncRuns.connectionId,
          provider: integrationSyncRuns.provider,
          externalAccountId: integrationSyncRuns.externalAccountId,
          status: integrationSyncRuns.status,
          source: integrationSyncRuns.source,
          recordsProcessed: integrationSyncRuns.recordsProcessed,
          errorMessage: integrationSyncRuns.errorMessage,
          startedAt: integrationSyncRuns.startedAt,
          completedAt: integrationSyncRuns.completedAt,
          createdAt: integrationSyncRuns.createdAt,
        })
        .from(integrationSyncRuns)
        .where(and(...filters))
        .orderBy(desc(integrationSyncRuns.createdAt))
        .limit(input.limit);
    }),

  getMetaWhatsappHealth: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;

    const [[tenant], [conn]] = await Promise.all([
      db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
      db
        .select({
          id: integrationConnections.id,
          status: integrationConnections.status,
          oauthTokens: integrationConnections.oauthTokens,
          meta: integrationConnections.meta,
        })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.tenantId, tenantId),
            eq(integrationConnections.provider, "meta"),
          ),
        )
        .limit(1),
    ]);

    const meta = (conn?.meta ?? {}) as Record<string, unknown>;
    const phoneNumberId =
      typeof meta["phoneNumberId"] === "string" ? (meta["phoneNumberId"] as string) : null;
    let hasAccessToken = false;
    if (conn?.oauthTokens && env.INTEGRATION_ENCRYPTION_KEY) {
      try {
        hasAccessToken = Boolean(
          (
            decryptTokens(conn.oauthTokens, env.INTEGRATION_ENCRYPTION_KEY) as {
              accessToken?: string;
            }
          ).accessToken,
        );
      } catch {
        hasAccessToken = false;
      }
    }

    const testMode = getWhatsAppTestModeConfig(env);
    const testModeIssues = getWhatsAppTestModeIssues(testMode);
    const isTestMode = isWhatsAppTestModeTenant(testMode, tenant?.slug ?? null);
    const testModeReady = isTestMode && testModeIssues.length === 0;

    return summarizeWhatsappConnectionHealth({
      connectionStatus: conn?.status ?? null,
      phoneNumberId:
        phoneNumberId ?? (testModeReady ? (env.WHATSAPP_PHONE_NUMBER_ID ?? null) : null),
      hasAccessToken: hasAccessToken || (testModeReady && Boolean(env.WHATSAPP_ACCESS_TOKEN)),
      isTestMode: testModeReady && !conn,
      meta:
        testModeIssues.length > 0
          ? {
              ...meta,
              lastFailureMessage:
                meta["lastFailureMessage"] ??
                `WhatsApp test mode is incomplete: ${testModeIssues.join(", ")}`,
            }
          : meta,
    });
  }),

  getSmsHealth: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const resolved = await resolveSmsForTenant(tenantId);
    const credentials = resolved?.credentials ?? null;
    const entitlement =
      resolved?.entitlement ??
      evaluateSmsEntitlement({
        monthlyLimit: 0,
        monthlyUsed: 0,
        providerConfigured: getSmsProviderHealth(env).configured,
      });
    const providerHealth = getSmsProviderHealth(credentials ?? env);

    const [[lastOutbound], [failedCount], [sentCount], [verification], [businessProfile]] =
      await Promise.all([
        db
          .select({
            occurredAt: messages.occurredAt,
            status: messages.status,
            errorMessage: messages.errorMessage,
            toAddress: messages.toAddress,
          })
          .from(messages)
          .where(
            and(
              eq(messages.tenantId, tenantId),
              eq(messages.channel, "sms"),
              eq(messages.direction, "outbound"),
            ),
          )
          .orderBy(desc(messages.occurredAt))
          .limit(1),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.tenantId, tenantId),
              eq(messages.channel, "sms"),
              eq(messages.direction, "outbound"),
              eq(messages.status, "failed"),
            ),
          ),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.tenantId, tenantId),
              eq(messages.channel, "sms"),
              eq(messages.direction, "outbound"),
              inArray(messages.status, ["sent", "delivered", "read"]),
            ),
          ),
        db
          .select({
            phone: smsPhoneVerifications.phone,
            status: smsPhoneVerifications.status,
            verifiedAt: smsPhoneVerifications.verifiedAt,
          })
          .from(smsPhoneVerifications)
          .where(eq(smsPhoneVerifications.tenantId, tenantId))
          .orderBy(desc(smsPhoneVerifications.createdAt))
          .limit(1),
        db
          .select({ leadCaptureSettings: businessProfiles.leadCaptureSettings })
          .from(businessProfiles)
          .where(eq(businessProfiles.tenantId, tenantId))
          .limit(1),
      ]);

    const failedSends = Number(failedCount?.total ?? 0);
    const smsSettings =
      businessProfile?.leadCaptureSettings &&
      typeof businessProfile.leadCaptureSettings === "object" &&
      !Array.isArray(businessProfile.leadCaptureSettings)
        ? ((businessProfile.leadCaptureSettings as Record<string, unknown>)["sms"] as
            | Record<string, unknown>
            | undefined)
        : undefined;
    return {
      status: entitlement.allowed
        ? failedSends > 0
          ? "attention"
          : "ready"
        : entitlement.reason === "plan_not_included" ||
            entitlement.reason === "monthly_limit_reached"
          ? "upgrade_required"
          : "missing",
      provider: providerHealth.providerLabel,
      providerKey: providerHealth.provider,
      configured: entitlement.allowed,
      originator: providerHealth.senderLabel,
      missing: providerHealth.missing,
      hasUserKey: providerHealth.configured,
      hasPassword: providerHealth.configured,
      lastOutboundAt: lastOutbound?.occurredAt ?? null,
      lastOutboundStatus: lastOutbound?.status ?? null,
      lastRecipient: lastOutbound?.toAddress ?? null,
      lastFailureMessage: lastOutbound?.status === "failed" ? lastOutbound.errorMessage : null,
      failedSends,
      sentSends: Number(sentCount?.total ?? 0),
      maxRecommendedChars: providerHealth.maxRecommendedChars,
      credentialMode: credentials?.mode ?? null,
      entitlement,
      plan: resolved?.tenant.plan ?? "trial",
      demoModeAllowed: resolved?.demoModeAllowed ?? false,
      verifiedBusinessPhone:
        verification?.status === "verified"
          ? verification.phone
          : typeof smsSettings?.["businessPhone"] === "string"
            ? (smsSettings["businessPhone"] as string)
            : null,
      phoneVerificationStatus: verification?.status ?? "not_started",
      phoneVerifiedAt: verification?.verifiedAt ?? null,
    };
  }),

  connectTwilio: requires("admin")
    .input(
      z.object({
        accountSid: z.string().regex(/^AC[a-zA-Z0-9]{20,}$/),
        authToken: z.string().min(20),
        fromNumber: z.string().min(8).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!env.INTEGRATION_ENCRYPTION_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Integration encryption is not configured.",
        });
      }
      const fromNumber = normalizeSmsPhone(input.fromNumber);
      const encrypted = encryptTokens(
        {
          accountSid: input.accountSid,
          authToken: input.authToken,
          fromNumber,
        },
        env.INTEGRATION_ENCRYPTION_KEY,
      );
      const [connection] = await db
        .insert(integrationConnections)
        .values({
          tenantId: ctx.tenantCtx.tenantId,
          provider: "twilio",
          externalAccountId: fromNumber,
          oauthTokens: encrypted,
          status: "connected",
          scopes: ["sms:send", "sms:receive"],
          meta: { fromNumber },
        })
        .onConflictDoUpdate({
          target: [
            integrationConnections.tenantId,
            integrationConnections.provider,
            integrationConnections.externalAccountId,
          ],
          set: {
            oauthTokens: encrypted,
            status: "connected",
            scopes: ["sms:send", "sms:receive"],
            meta: { fromNumber },
            updatedAt: new Date(),
          },
        })
        .returning({ id: integrationConnections.id });
      return { id: connection?.id, fromNumber };
    }),

  sendSmsTestMessage: requires("admin")
    .input(
      z.object({
        toPhone: z.string().min(5).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const resolved = await resolveSmsForTenant(tenantId);
      const credentials = resolved?.credentials ?? null;
      if (!credentials) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            resolved?.entitlement.reason === "plan_not_included"
              ? "SMS automation is not included in this plan."
              : resolved?.entitlement.reason === "monthly_limit_reached"
                ? "Monthly SMS limit reached."
                : "SMS is not configured for this tenant.",
        });
      }

      let normalizedPhone: string;
      try {
        normalizedPhone = normalizeSmsPhone(input.toPhone);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter the recipient number in international format, for example +41761234567.",
        });
      }

      const [tenant] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }

      const text = `Test from ${tenant.name}: SMS automation is connected and ready for lead follow-up.`;
      const [message] = await db
        .insert(messages)
        .values({
          tenantId,
          channel: "sms",
          direction: "outbound",
          fromAddress: credentials.senderAddress,
          toAddress: normalizedPhone,
          body: text,
          messageType: "test",
          status: "queued",
          meta: {
            provider: credentials.provider,
            integrationTest: true,
            purpose: "integration_test",
          },
        })
        .returning({ id: messages.id });
      if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await enqueueSmsSendJob({ tenantId, messageId: message.id });
      return {
        ok: true,
        provider: getSmsProviderHealth(credentials).providerLabel,
        toPhone: normalizedPhone,
        messageId: message.id,
        sandbox: credentials.provider === "sandbox",
        queued: true,
      };
    }),

  sendWhatsappTestMessage: requires("admin")
    .input(
      z.object({
        toPhone: z.string().min(5).max(20),
        text: z.string().min(1).max(4096).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const normalizedPhone = input.toPhone.replace(/[\s()+-]/g, "");
      if (!/^\d{7,15}$/.test(normalizedPhone)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter the recipient number in international format, for example +41761234567.",
        });
      }

      const [[tenant], [conn]] = await Promise.all([
        db
          .select({ slug: tenants.slug, name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1),
        db
          .select({
            oauthTokens: integrationConnections.oauthTokens,
            meta: integrationConnections.meta,
          })
          .from(integrationConnections)
          .where(
            and(
              eq(integrationConnections.tenantId, tenantId),
              eq(integrationConnections.provider, "meta"),
            ),
          )
          .limit(1),
      ]);

      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      }

      const credentials = resolveWhatsappCredentials({
        tenantSlug: tenant.slug,
        connection: conn
          ? {
              oauthTokens: conn.oauthTokens,
              meta:
                conn.meta && typeof conn.meta === "object"
                  ? (conn.meta as Record<string, unknown>)
                  : null,
            }
          : null,
        env,
      });

      if (!credentials) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "WhatsApp is not connected or demo mode is not enabled for this tenant.",
        });
      }

      const text =
        input.text?.trim() ||
        `Test from ${tenant.name}: WhatsApp automation is connected and ready for lead follow-up.`;

      try {
        const result = await sendWhatsAppText(
          credentials.phoneNumberId,
          credentials.accessToken,
          normalizedPhone,
          text,
        );

        return {
          ok: true,
          messageId: result.messageId,
          mode: credentials.mode,
          toPhone: normalizedPhone,
        };
      } catch (error) {
        const message =
          error instanceof WhatsAppApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "WhatsApp test message failed.";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message,
        });
      }
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

  /** Trigger a manual sync. Admin+ only. External provider calls happen in workers. */
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
      if (row.status !== "connected") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Connection is ${row.status}`,
        });
      }
      const syncProviders = [
        "gastrofix",
        "lightspeed_ch",
        "eversports",
        "bexio",
        "meta",
        "google_business",
        "resend",
      ] as const;
      if (!(syncProviders as readonly string[]).includes(row.provider)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${row.provider} is event-driven and does not support manual sync.`,
        });
      }
      const syncProvider = row.provider as (typeof syncProviders)[number];

      const [syncRun] = await db
        .insert(integrationSyncRuns)
        .values({
          tenantId: ctx.tenantCtx.tenantId,
          connectionId: row.id,
          provider: syncProvider,
          externalAccountId: row.externalAccountId,
          status: "queued",
          source: "manual",
        })
        .returning();

      if (!syncRun) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create sync run",
        });
      }

      await enqueueIntegrationSyncJob(
        "integration-sync",
        {
          tenantId: ctx.tenantCtx.tenantId,
          connectionId: row.id,
          syncRunId: syncRun.id,
          provider: syncProvider,
          source: "manual",
        },
        {
          jobId: `integration-sync:${syncRun.id}`,
        },
      );

      return {
        id: syncRun.id,
        status: syncRun.status,
        provider: syncRun.provider,
        connectionId: syncRun.connectionId,
        recordsProcessed: syncRun.recordsProcessed,
      };
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
          jobId: socialPosts.jobId,
          creativeImageUrl: socialPosts.creativeImageUrl,
          creativeStatus: socialPosts.creativeStatus,
          creativeUpdatedAt: socialPosts.creativeUpdatedAt,
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

      const publishImageUrl =
        post.creativeImageUrl && post.creativeStatus === "completed"
          ? absolutizeSocialCreativeUrl(ctx.requestOrigin, post.creativeImageUrl)
          : post.creativeStatus === "completed"
            ? getSocialCreativePublicUrl(
                ctx.requestOrigin,
                post.jobId,
                post.creativeUpdatedAt ?? "latest",
              )
            : post.imageUrl;

      const result = await adapter.publishPost(connection, post.generatedText, publishImageUrl);

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
        igSkipped: connMeta.igConnected && !publishImageUrl,
      };
    }),
});
