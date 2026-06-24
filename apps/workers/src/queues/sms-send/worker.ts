import { SMS_SEND_QUEUE_NAME, smsSendJobSchema, type SmsSendJob } from "@marketing/ai-router";
import {
  db,
  integrationConnections,
  messages,
  smsPreferences,
  smsSequenceEnrollments,
  tenants,
  usageRecords,
} from "@marketing/db";
import {
  getSmsProviderHealth,
  isSmsTestModeTenant,
  resolveSmsCredentials,
  sendSmsViaConfiguredProvider,
} from "@marketing/integrations";
import { getPlanCaps, smsUsageMonthStart } from "@marketing/billing";
import {
  evaluateSmsEntitlement,
  env,
  isSmsMarketingPurpose,
  logger,
  normalizeSmsPhone,
  type SmsPurpose,
} from "@marketing/shared";
import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import { Worker, type Job } from "bullmq";
import { connection } from "./queue";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function processSmsSend(rawJob: Job<SmsSendJob>): Promise<void> {
  const job = smsSendJobSchema.parse(rawJob.data);
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.tenantId, job.tenantId), eq(messages.id, job.messageId)))
    .limit(1);
  if (!message || message.status !== "queued") return;

  const meta = asRecord(message.meta);
  const purpose = (meta["purpose"] as SmsPurpose | undefined) ?? "manual_reply";
  const normalizedPhone = normalizeSmsPhone(message.toAddress);

  const [[tenant], [connectionRow], [preference], [tenantCount], [contactCount]] =
    await Promise.all([
      db
        .select({ slug: tenants.slug, plan: tenants.plan })
        .from(tenants)
        .where(eq(tenants.id, job.tenantId))
        .limit(1),
      db
        .select({
          oauthTokens: integrationConnections.oauthTokens,
          meta: integrationConnections.meta,
        })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.tenantId, job.tenantId),
            eq(integrationConnections.provider, "twilio"),
            eq(integrationConnections.status, "connected"),
          ),
        )
        .limit(1),
      db
        .select({ status: smsPreferences.status, marketingOptIn: smsPreferences.marketingOptIn })
        .from(smsPreferences)
        .where(
          and(eq(smsPreferences.tenantId, job.tenantId), eq(smsPreferences.phone, normalizedPhone)),
        )
        .limit(1),
      db
        .select({ total: count() })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, job.tenantId),
            eq(messages.channel, "sms"),
            eq(messages.direction, "outbound"),
            ne(messages.status, "failed"),
            gte(
              messages.occurredAt,
              sql`date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich'`,
            ),
          ),
        ),
      db
        .select({ total: count() })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, job.tenantId),
            eq(messages.channel, "sms"),
            eq(messages.direction, "outbound"),
            eq(messages.toAddress, normalizedPhone),
            ne(messages.status, "failed"),
            gte(
              messages.occurredAt,
              sql`date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich'`,
            ),
          ),
        ),
    ]);

  if (!tenant) throw new Error("SMS tenant not found.");
  const [monthlyUsage] = await db
    .select({ total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int` })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.tenantId, job.tenantId),
        eq(usageRecords.metric, "sms_sent"),
        gte(usageRecords.recordedAt, smsUsageMonthStart()),
      ),
    );
  const demoModeAllowed = isSmsTestModeTenant(env, tenant.slug);
  const providerConfigured = Boolean(connectionRow) || getSmsProviderHealth(env).configured;
  const entitlement = evaluateSmsEntitlement({
    monthlyLimit: getPlanCaps(tenant.plan).monthlySmsLimit,
    monthlyUsed: Number(monthlyUsage?.total ?? 0),
    providerConfigured,
    demoModeAllowed,
  });
  if (!entitlement.allowed) {
    await db
      .update(messages)
      .set({
        status: "failed",
        errorMessage:
          entitlement.reason === "monthly_limit_reached"
            ? "Monthly SMS limit reached. Upgrade or wait until next month."
            : entitlement.reason === "plan_not_included"
              ? "SMS automation is not included in this plan."
              : "Platform SMS provider is not configured.",
      })
      .where(and(eq(messages.tenantId, job.tenantId), eq(messages.id, job.messageId)));
    return;
  }

  if (preference?.status === "opted_out" && isSmsMarketingPurpose(purpose)) {
    await db
      .update(messages)
      .set({ status: "failed", errorMessage: "Recipient opted out of marketing SMS." })
      .where(and(eq(messages.tenantId, job.tenantId), eq(messages.id, job.messageId)));
    return;
  }
  if (isSmsMarketingPurpose(purpose) && preference?.marketingOptIn !== true) {
    await db
      .update(messages)
      .set({ status: "failed", errorMessage: "Marketing SMS consent is missing." })
      .where(and(eq(messages.tenantId, job.tenantId), eq(messages.id, job.messageId)));
    return;
  }
  if (Number(tenantCount?.total ?? 0) > env.SMS_DAILY_TENANT_CAP) {
    throw new Error("Tenant daily SMS cap reached.");
  }
  if (Number(contactCount?.total ?? 0) > env.SMS_DAILY_CONTACT_CAP) {
    throw new Error("Contact daily SMS cap reached.");
  }

  const credentials = resolveSmsCredentials({
    tenantSlug: tenant.slug,
    connection: connectionRow
      ? {
          oauthTokens: connectionRow.oauthTokens,
          meta: asRecord(connectionRow.meta),
        }
      : null,
    env,
    allowPlatformManaged: entitlement.allowed,
  });
  if (!credentials) throw new Error("SMS credentials are not available for this tenant.");

  try {
    const result = await sendSmsViaConfiguredProvider(credentials, {
      to: normalizedPhone,
      text: message.body,
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
          ...meta,
          provider: result.provider,
          providerLabel: result.providerLabel,
          segmentCount: result.segmentCount,
          statusCode: result.statusCode,
          statusInfo: result.statusInfo,
          credentialMode: credentials.mode,
          sandbox: result.sandbox,
        },
      })
      .where(and(eq(messages.tenantId, job.tenantId), eq(messages.id, job.messageId)));
    if (!result.sandbox) {
      await db.insert(usageRecords).values([
        {
          tenantId: job.tenantId,
          metric: "sms_sent",
          quantity: 1,
        },
        {
          tenantId: job.tenantId,
          metric: "sms_segments",
          quantity: Math.max(1, result.segmentCount),
        },
      ]);
    }
  } catch (error) {
    const finalAttempt = rawJob.attemptsMade + 1 >= Number(rawJob.opts.attempts ?? 1);
    if (finalAttempt) {
      await db
        .update(messages)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "SMS send failed.",
        })
        .where(and(eq(messages.tenantId, job.tenantId), eq(messages.id, job.messageId)));
      const enrollmentId = typeof meta["enrollmentId"] === "string" ? meta["enrollmentId"] : null;
      if (enrollmentId) {
        await db
          .update(smsSequenceEnrollments)
          .set({ status: "failed", updatedAt: new Date() })
          .where(
            and(
              eq(smsSequenceEnrollments.tenantId, job.tenantId),
              eq(smsSequenceEnrollments.id, enrollmentId),
            ),
          );
      }
    }
    throw error;
  }
}

export const smsSendWorker = new Worker<SmsSendJob>(SMS_SEND_QUEUE_NAME, processSmsSend, {
  connection,
  concurrency: 8,
});

smsSendWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[sms-send] completed");
});

smsSendWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error: String(error) }, "[sms-send] failed");
});
