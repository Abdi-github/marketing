import {
  SMS_SEQUENCE_TICK_QUEUE_NAME,
  SMS_SEQUENCE_TRIGGER_QUEUE_NAME,
  smsSequenceTriggerJobSchema,
  type SmsSequenceTriggerJob,
} from "@marketing/ai-router";
import {
  businessProfiles,
  contacts,
  db,
  leads,
  messages,
  smsPreferences,
  smsSequenceEnrollments,
  smsSequences,
  smsTemplates,
  type SmsSequenceStep,
  type SmsSequenceTriggerFilter,
} from "@marketing/db";
import {
  interpolateSmsTemplate,
  isInsideQuietHours,
  logger,
  matchesSmsTriggerFilter,
  normalizeSmsPhone,
} from "@marketing/shared";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { Worker, type Job } from "bullmq";
import { smsSendQueue } from "../sms-send/queue";
import { connection, smsSequenceTickQueue } from "./queue";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deferPastQuietHours(now: Date, timezone: string, start: string, end: string): Date {
  const candidate = new Date(now);
  for (let index = 0; index < 48; index += 1) {
    if (!isInsideQuietHours({ date: candidate, timezone, start, end })) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 30);
  }
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
}

async function processTrigger(rawJob: Job<SmsSequenceTriggerJob>): Promise<void> {
  const job = smsSequenceTriggerJobSchema.parse(rawJob.data);
  const conditions = [
    eq(smsSequences.tenantId, job.tenantId),
    eq(smsSequences.triggerEvent, job.eventType),
    eq(smsSequences.status, "active"),
  ];
  if (job.sequenceId) {
    conditions.push(eq(smsSequences.id, job.sequenceId));
  }
  const sequences = await db
    .select()
    .from(smsSequences)
    .where(and(...conditions));

  for (const sequence of sequences) {
    const filter = asRecord(sequence.triggerFilter) as SmsSequenceTriggerFilter;
    if (!matchesSmsTriggerFilter(job.payload, filter)) continue;
    const steps = Array.isArray(sequence.steps) ? (sequence.steps as SmsSequenceStep[]) : [];
    if (steps.length === 0) continue;
    const firstRunAt = new Date(Date.now() + Math.max(0, steps[0]?.delay_minutes ?? 0) * 60_000);
    await db
      .insert(smsSequenceEnrollments)
      .values({
        tenantId: job.tenantId,
        sequenceId: sequence.id,
        contactId: job.contactId,
        leadId: job.leadId,
        nextRunAt: firstRunAt,
      })
      .onConflictDoNothing();
  }
}

async function processDueEnrollments(): Promise<number> {
  const due = await db
    .select()
    .from(smsSequenceEnrollments)
    .where(
      and(
        eq(smsSequenceEnrollments.status, "enrolled"),
        lte(smsSequenceEnrollments.nextRunAt, new Date()),
      ),
    )
    .limit(100);

  let queued = 0;
  for (const enrollment of due) {
    const [[sequence], [contact], [lead], [profile]] = await Promise.all([
      db
        .select()
        .from(smsSequences)
        .where(
          and(
            eq(smsSequences.tenantId, enrollment.tenantId),
            eq(smsSequences.id, enrollment.sequenceId),
          ),
        )
        .limit(1),
      db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.tenantId, enrollment.tenantId), eq(contacts.id, enrollment.contactId)),
        )
        .limit(1),
      enrollment.leadId
        ? db
            .select()
            .from(leads)
            .where(and(eq(leads.tenantId, enrollment.tenantId), eq(leads.id, enrollment.leadId)))
            .limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, enrollment.tenantId))
        .limit(1),
    ]);

    if (!sequence || sequence.status !== "active" || !contact?.phone) {
      await db
        .update(smsSequenceEnrollments)
        .set({ status: "exited", updatedAt: new Date() })
        .where(eq(smsSequenceEnrollments.id, enrollment.id));
      continue;
    }

    const [sequenceCount] = await db
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, enrollment.tenantId),
          eq(messages.channel, "sms"),
          sql`${messages.meta}->>'sequenceId' = ${sequence.id}`,
          gte(
            messages.occurredAt,
            sql`date_trunc('day', now() AT TIME ZONE ${sequence.timezone}) AT TIME ZONE ${sequence.timezone}`,
          ),
        ),
      );
    if (Number(sequenceCount?.total ?? 0) >= sequence.dailyCap) {
      await db
        .update(smsSequenceEnrollments)
        .set({
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(smsSequenceEnrollments.id, enrollment.id));
      continue;
    }

    const steps = Array.isArray(sequence.steps) ? (sequence.steps as SmsSequenceStep[]) : [];
    const step = steps[enrollment.currentStep];
    if (!step) {
      await db
        .update(smsSequenceEnrollments)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(smsSequenceEnrollments.id, enrollment.id));
      continue;
    }

    if (
      isInsideQuietHours({
        date: new Date(),
        timezone: sequence.timezone,
        start: sequence.quietHoursStart,
        end: sequence.quietHoursEnd,
      })
    ) {
      await db
        .update(smsSequenceEnrollments)
        .set({
          nextRunAt: deferPastQuietHours(
            new Date(),
            sequence.timezone,
            sequence.quietHoursStart,
            sequence.quietHoursEnd,
          ),
          updatedAt: new Date(),
        })
        .where(eq(smsSequenceEnrollments.id, enrollment.id));
      continue;
    }

    const phone = normalizeSmsPhone(contact.phone);
    const [preference] = await db
      .select()
      .from(smsPreferences)
      .where(and(eq(smsPreferences.tenantId, enrollment.tenantId), eq(smsPreferences.phone, phone)))
      .limit(1);
    if (
      step.purpose === "marketing" &&
      (preference?.status === "opted_out" || preference?.marketingOptIn !== true)
    ) {
      await db
        .update(smsSequenceEnrollments)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(eq(smsSequenceEnrollments.id, enrollment.id));
      continue;
    }

    const [template] = await db
      .select()
      .from(smsTemplates)
      .where(
        and(eq(smsTemplates.tenantId, enrollment.tenantId), eq(smsTemplates.id, step.template_id)),
      )
      .limit(1);
    if (!template) {
      await db
        .update(smsSequenceEnrollments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(smsSequenceEnrollments.id, enrollment.id));
      continue;
    }

    const structured = asRecord(lead?.structuredData);
    const body = interpolateSmsTemplate(template.body, {
      first_name: contact.firstName,
      business_name: profile?.businessName ?? "our team",
      reservation_date: String(structured["reservationDate"] ?? ""),
      reservation_time: String(structured["reservationTime"] ?? ""),
      party_size: String(structured["partySize"] ?? ""),
    }).trim();

    const [message] = await db
      .insert(messages)
      .values({
        tenantId: enrollment.tenantId,
        contactId: enrollment.contactId,
        channel: "sms",
        direction: "outbound",
        fromAddress: "pending",
        toAddress: phone,
        body,
        messageType: "sequence",
        status: "queued",
        meta: {
          automated: true,
          enrollmentId: enrollment.id,
          sequenceId: sequence.id,
          templateId: template.id,
          stepIndex: enrollment.currentStep,
          purpose: step.purpose === "marketing" ? "sequence_marketing" : "sequence_transactional",
        },
      })
      .onConflictDoNothing()
      .returning({ id: messages.id });

    if (message) {
      await smsSendQueue.add(
        "send",
        { tenantId: enrollment.tenantId, messageId: message.id },
        { jobId: `sms-send-${message.id}` },
      );
      queued += 1;
    }

    const nextStepIndex = enrollment.currentStep + 1;
    const nextStep = steps[nextStepIndex];
    await db
      .update(smsSequenceEnrollments)
      .set(
        nextStep
          ? {
              currentStep: nextStepIndex,
              nextRunAt: new Date(Date.now() + Math.max(0, nextStep.delay_minutes) * 60_000),
              updatedAt: new Date(),
            }
          : {
              currentStep: nextStepIndex,
              status: "completed",
              completedAt: new Date(),
              updatedAt: new Date(),
            },
      )
      .where(eq(smsSequenceEnrollments.id, enrollment.id));
  }
  return queued;
}

export const smsSequenceTriggerWorker = new Worker<SmsSequenceTriggerJob>(
  SMS_SEQUENCE_TRIGGER_QUEUE_NAME,
  processTrigger,
  { connection, concurrency: 4 },
);

export const smsSequenceTickWorker = new Worker<Record<string, never>>(
  SMS_SEQUENCE_TICK_QUEUE_NAME,
  async () => {
    const queued = await processDueEnrollments();
    logger.info({ queued }, "[sms-sequence] tick complete");
  },
  { connection, concurrency: 1 },
);

smsSequenceTickQueue
  .add("cron", {}, { repeat: { pattern: "* * * * *" }, jobId: "sms-sequence-tick-cron" })
  .catch((error) => {
    logger.error({ error: String(error) }, "[sms-sequence] failed to schedule tick");
  });
