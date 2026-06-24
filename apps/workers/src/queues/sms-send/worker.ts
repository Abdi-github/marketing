import { SMS_SEND_QUEUE_NAME, smsSendJobSchema, type SmsSendJob } from "@marketing/ai-router";
import {
  db,
  integrationConnections,
  messages,
  smsPreferences,
  smsSequenceEnrollments,
  tenants,
} from "@marketing/db";
import { resolveSmsCredentials, sendSmsViaConfiguredProvider } from "@marketing/integrations";
import {
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
      db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, job.tenantId)).limit(1),
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
