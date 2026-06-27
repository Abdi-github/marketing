import {
  db,
  businessProfiles,
  integrationConnections,
  messages,
  notificationPreferences,
  notifications,
  smsPhoneVerifications,
  subscriptions,
  tenants,
  usageRecords,
} from "@marketing/db";
import { getPlanCaps, smsUsageMonthStart } from "@marketing/billing";
import {
  getSmsProviderHealth,
  isSmsPlatformTestModeEnabled,
  resolveSmsCredentials,
  sendSmsViaConfiguredProvider,
} from "@marketing/integrations";
import { env, evaluateSmsEntitlement, logger, normalizeSmsPhone } from "@marketing/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";

type NotificationPriority = "low" | "normal" | "high";

export type CreateTenantNotificationInput = {
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  priority?: NotificationPriority;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  staffSms?: {
    enabled?: boolean;
    text: string;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getSmsBusinessPhone(settings: unknown): string | null {
  const root = asRecord(settings);
  const sms = asRecord(root["sms"]);
  return typeof sms["businessPhone"] === "string" ? sms["businessPhone"] : null;
}

async function resolveStaffSmsCredentials(tenantId: string) {
  const [[tenant], [subscription], [connection], [monthlyUsage]] = await Promise.all([
    db
      .select({ slug: tenants.slug, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "active")))
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
          gte(usageRecords.recordedAt, smsUsageMonthStart()),
        ),
      ),
  ]);

  if (!tenant) return { credentials: null, reason: "Tenant not found." };

  const effectivePlan =
    tenant.plan === "trial" && subscription?.plan ? subscription.plan : tenant.plan;
  const providerConfigured = Boolean(connection) || getSmsProviderHealth(env).configured;
  const entitlement = evaluateSmsEntitlement({
    monthlyLimit: getPlanCaps(effectivePlan).monthlySmsLimit,
    monthlyUsed: Number(monthlyUsage?.total ?? 0),
    providerConfigured,
    demoModeAllowed: isSmsPlatformTestModeEnabled(env),
  });

  if (!entitlement.allowed) {
    const reason =
      entitlement.reason === "monthly_limit_reached"
        ? "Monthly SMS limit reached. Upgrade or wait until next month."
        : entitlement.reason === "plan_not_included"
          ? "SMS automation is not included in this plan."
          : "Platform SMS provider is not configured.";
    return { credentials: null, reason };
  }

  const credentials = resolveSmsCredentials({
    tenantSlug: tenant.slug,
    connection: connection
      ? {
          oauthTokens: connection.oauthTokens,
          meta: asRecord(connection.meta),
        }
      : null,
    env,
    allowPlatformManaged: true,
  });

  return {
    credentials,
    reason: credentials ? null : "SMS credentials are not available for this tenant.",
  };
}

async function getNotificationPreferences(tenantId: string) {
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.tenantId, tenantId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(notificationPreferences)
    .values({ tenantId })
    .onConflictDoNothing({ target: notificationPreferences.tenantId })
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

export async function createTenantNotification(input: CreateTenantNotificationInput) {
  const preferences = await getNotificationPreferences(input.tenantId);
  if (preferences?.inAppEnabled === false) return null;

  const [notification] = await db
    .insert(notifications)
    .values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      priority: input.priority ?? "normal",
      actionUrl: input.actionUrl ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [notifications.tenantId, notifications.idempotencyKey],
    })
    .returning();

  if (notification && input.staffSms?.enabled !== false) {
    await maybeSendStaffSmsAlert({
      tenantId: input.tenantId,
      text: input.staffSms?.text ?? `${input.title}${input.body ? ` ${input.body}` : ""}`,
      notificationId: notification.id,
      preferences,
    }).catch((error) => {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          tenantId: input.tenantId,
          notificationId: notification.id,
        },
        "[notifications] Failed to enqueue staff SMS alert",
      );
    });
  }

  return notification ?? null;
}

async function maybeSendStaffSmsAlert(input: {
  tenantId: string;
  text: string;
  notificationId: string;
  preferences: Awaited<ReturnType<typeof getNotificationPreferences>>;
}) {
  if (input.preferences?.staffSmsEnabled === false) return;

  const [[profile], [latestVerifiedPhone]] = await Promise.all([
    db
      .select({ leadCaptureSettings: businessProfiles.leadCaptureSettings })
      .from(businessProfiles)
      .where(eq(businessProfiles.tenantId, input.tenantId))
      .limit(1),
    db
      .select({ phone: smsPhoneVerifications.phone })
      .from(smsPhoneVerifications)
      .where(
        and(
          eq(smsPhoneVerifications.tenantId, input.tenantId),
          eq(smsPhoneVerifications.status, "verified"),
        ),
      )
      .orderBy(desc(smsPhoneVerifications.verifiedAt), desc(smsPhoneVerifications.createdAt))
      .limit(1),
  ]);

  const phone =
    input.preferences?.staffSmsPhone ??
    getSmsBusinessPhone(profile?.leadCaptureSettings) ??
    latestVerifiedPhone?.phone;
  if (!phone) return;

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeSmsPhone(phone);
  } catch {
    return;
  }

  const body = input.text.length > 320 ? `${input.text.slice(0, 317)}...` : input.text;
  const [existing] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, input.tenantId),
        eq(messages.channel, "sms"),
        eq(messages.messageType, "staff_alert"),
        eq(messages.externalId, `notification:${input.notificationId}`),
      ),
    )
    .limit(1);
  if (existing) return;

  const { credentials, reason } = await resolveStaffSmsCredentials(input.tenantId);

  const [message] = await db
    .insert(messages)
    .values({
      tenantId: input.tenantId,
      channel: "sms",
      direction: "outbound",
      fromAddress: credentials?.senderAddress ?? "platform",
      toAddress: normalizedPhone,
      body,
      messageType: "staff_alert",
      status: credentials ? "queued" : "failed",
      errorMessage: credentials ? null : reason,
      externalId: `notification:${input.notificationId}`,
      meta: {
        purpose: "staff_alert",
        notificationId: input.notificationId,
        immediate: true,
      },
    })
    .returning({ id: messages.id });

  if (!message || !credentials) return;

  try {
    const result = await sendSmsViaConfiguredProvider(credentials, {
      to: normalizedPhone,
      text: body,
    });
    await db
      .update(messages)
      .set({
        status: result.sandbox ? "delivered" : "sent",
        externalId: result.messageId,
        fromAddress: result.fromAddress,
        toAddress: result.toAddress,
        errorMessage: null,
        meta: {
          purpose: "staff_alert",
          notificationId: input.notificationId,
          provider: result.provider,
          providerLabel: result.providerLabel,
          credentialMode: credentials.mode,
          segmentCount: result.segmentCount,
          statusCode: result.statusCode,
          statusInfo: result.statusInfo,
          sandbox: result.sandbox,
          immediate: true,
        },
      })
      .where(and(eq(messages.tenantId, input.tenantId), eq(messages.id, message.id)));
    if (!result.sandbox) {
      await db.insert(usageRecords).values([
        {
          tenantId: input.tenantId,
          metric: "sms_sent",
          quantity: 1,
        },
        {
          tenantId: input.tenantId,
          metric: "sms_segments",
          quantity: Math.max(1, result.segmentCount),
        },
      ]);
    }
  } catch (error) {
    await db
      .update(messages)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Staff SMS alert failed.",
      })
      .where(and(eq(messages.tenantId, input.tenantId), eq(messages.id, message.id)));
    logger.warn(
      {
        tenantId: input.tenantId,
        notificationId: input.notificationId,
        messageId: message.id,
        err: error instanceof Error ? error.message : String(error),
      },
      "[notifications] Immediate staff SMS alert failed",
    );
  }
}
