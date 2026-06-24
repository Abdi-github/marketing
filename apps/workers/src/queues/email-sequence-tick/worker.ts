// Email sequence tick worker (step-26).
// Runs every 5 minutes via BullMQ repeatable job.
//
// Phase A — Outbox enrollment: reads unpublished outbox events for
//   lead.captured / contact.score_changed / contact.lifecycle_changed,
//   finds active sequences with matching triggerEvent + filter,
//   creates enrollments (idempotent via UNIQUE constraint).
//   Marks outbox rows as published after processing.
//
// Phase B — Send due emails: reads enrollments where status='enrolled'
//   AND next_run_at <= now(), sends the next step via Resend, advances enrollment.
//
// ADR-0023: sandbox mode when RESEND_API_KEY is unset (log only, no actual send).
import { db } from "@marketing/db";
import {
  businessProfiles,
  contacts,
  emailPreferences,
  emailSequenceEnrollments,
  emailSequences,
  emailSends,
  emailSendingDomains,
  emailSuppressions,
  emailTemplates,
  eventProcessed,
  leads,
  outbox,
  tenantUsers,
  users,
} from "@marketing/db";
import { sendViaResend, interpolate } from "@marketing/integrations";
import { env, logger } from "@marketing/shared";
import { Worker } from "bullmq";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { connection, EMAIL_SEQUENCE_TICK_QUEUE_NAME, emailSequenceTickQueue } from "./queue";
import { matchesTriggerFilter } from "./filters";
import { buildUnsubscribeUrl, withUnsubscribeFooter } from "./unsubscribe";
import type { EmailSequenceTickJob } from "./queue";
import type { SequenceStep, SequenceTriggerFilter } from "@marketing/db";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

async function resolveSenderAddress(tenantId: string): Promise<string> {
  const [domain] = await db
    .select({
      domain: emailSendingDomains.domain,
      fromName: emailSendingDomains.fromName,
      fromLocalPart: emailSendingDomains.fromLocalPart,
    })
    .from(emailSendingDomains)
    .where(
      and(
        eq(emailSendingDomains.tenantId, tenantId),
        eq(emailSendingDomains.status, "verified"),
        eq(emailSendingDomains.isPrimary, true),
      ),
    );

  if (!domain) return env.EMAIL_FROM_ADDRESS;
  return `${domain.fromName} <${domain.fromLocalPart}@${domain.domain}>`;
}

function isUsableSenderAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const email = normalized.match(/<([^>]+)>/)?.[1] ?? normalized;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".localhost");
}

async function resolveReplyToAddress(tenantId: string): Promise<string | undefined> {
  const [owner] = await db
    .select({ email: users.email })
    .from(tenantUsers)
    .innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.role, "owner")));

  return owner?.email;
}

// ─── Trigger filter evaluation ────────────────────────────────────────────────

const TRIGGER_EVENT_TYPES = ["lead.captured", "contact.score_changed", "contact.lifecycle_changed"];

async function processOutboxEnrollments(): Promise<number> {
  const pendingEvents = await db
    .select({
      id: outbox.id,
      eventId: outbox.eventId,
      tenantId: outbox.tenantId,
      type: outbox.type,
      payload: outbox.payload,
    })
    .from(outbox)
    .where(
      and(
        isNull(outbox.publishedAt),
        sql`${outbox.type} = ANY(ARRAY[${sql.raw(TRIGGER_EVENT_TYPES.map((t) => `'${t}'`).join(","))}]::text[])`,
      ),
    )
    .limit(100);

  let enrolled = 0;

  for (const event of pendingEvents) {
    if (!event.tenantId) continue;
    const tenantId = event.tenantId;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    let contactId = typeof payload.contactId === "string" ? payload.contactId : null;

    if (!contactId && typeof payload.leadId === "string") {
      const [lead] = await db
        .select({ contactId: leads.contactId })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.id, payload.leadId)));
      contactId = lead?.contactId ?? null;
    }

    if (!contactId) {
      // Mark as published without enrolling — no contact to act on.
      await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
      continue;
    }

    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    if (!contact) {
      logger.warn(
        { eventId: event.eventId, contactId },
        "[seq-tick] contact missing for automation event",
      );
      await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
      continue;
    }

    try {
      // Idempotency: skip if this handler already processed this event.
      await db.insert(eventProcessed).values({
        eventId: event.eventId,
        handlerName: "email-sequence-enroller",
      });
    } catch {
      // Conflict = already processed. Mark published and move on.
      await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
      continue;
    }

    // Find active sequences for this tenant + trigger event.
    const sequences = await db
      .select({
        id: emailSequences.id,
        triggerFilter: emailSequences.triggerFilter,
        steps: emailSequences.steps,
      })
      .from(emailSequences)
      .where(
        and(
          eq(emailSequences.tenantId, tenantId),
          eq(
            emailSequences.triggerEvent,
            event.type as "lead.captured" | "contact.score_changed" | "contact.lifecycle_changed",
          ),
          eq(emailSequences.status, "active"),
        ),
      );

    for (const seq of sequences) {
      const steps = (seq.steps ?? []) as SequenceStep[];
      if (steps.length === 0) continue;

      const filter = (seq.triggerFilter ?? {}) as SequenceTriggerFilter;
      if (!matchesTriggerFilter(event.type, payload, filter)) continue;

      // Enroll contact — UNIQUE(sequence_id, contact_id) prevents duplicates.
      const firstStepDelay = steps[0]?.delay_minutes ?? 0;
      const nextRunAt = new Date(Date.now() + firstStepDelay * 60 * 1000);

      try {
        await db
          .insert(emailSequenceEnrollments)
          .values({ tenantId, sequenceId: seq.id, contactId, nextRunAt })
          .onConflictDoNothing();
        enrolled++;
      } catch (err) {
        logger.warn(
          { err: String(err), sequenceId: seq.id, contactId },
          "[seq-tick] enrollment insert failed",
        );
      }
    }

    await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
  }

  return enrolled;
}

// ─── Phase B: Send due emails ─────────────────────────────────────────────────

async function sendDueEmails(): Promise<number> {
  const dueEnrollments = await db
    .select({
      id: emailSequenceEnrollments.id,
      tenantId: emailSequenceEnrollments.tenantId,
      sequenceId: emailSequenceEnrollments.sequenceId,
      contactId: emailSequenceEnrollments.contactId,
      currentStep: emailSequenceEnrollments.currentStep,
    })
    .from(emailSequenceEnrollments)
    .where(
      and(
        eq(emailSequenceEnrollments.status, "enrolled"),
        lte(emailSequenceEnrollments.nextRunAt, new Date()),
      ),
    )
    .limit(50);

  let sent = 0;

  for (const enrollment of dueEnrollments) {
    const { tenantId, sequenceId, contactId, currentStep } = enrollment;

    try {
      // 1. Load the sequence steps.
      const [seq] = await db
        .select({ steps: emailSequences.steps, status: emailSequences.status })
        .from(emailSequences)
        .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, sequenceId)));

      if (!seq || seq.status !== "active") {
        await db
          .update(emailSequenceEnrollments)
          .set({ status: "exited", updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      const steps = (seq.steps ?? []) as SequenceStep[];
      const step = steps[currentStep];

      if (!step) {
        // No more steps — mark as completed.
        await db
          .update(emailSequenceEnrollments)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      // 2. Load template + contact + business profile.
      const [[template], [contact], [profile]] = await Promise.all([
        db
          .select({
            subject: emailTemplates.subject,
            bodyHtml: emailTemplates.bodyHtml,
            bodyText: emailTemplates.bodyText,
          })
          .from(emailTemplates)
          .where(
            and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.id, step.template_id)),
          ),
        db
          .select({
            email: contacts.email,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
          })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId))),
        db
          .select({ businessName: businessProfiles.businessName })
          .from(businessProfiles)
          .where(eq(businessProfiles.tenantId, tenantId)),
      ]);

      if (!template || !contact) {
        logger.warn(
          { enrollmentId: enrollment.id },
          "[seq-tick] missing template or contact — exiting enrollment",
        );
        await db
          .update(emailSequenceEnrollments)
          .set({ status: "exited", updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      const normalizedEmail = normalizeEmail(contact.email);
      const [suppression] = await db
        .select({ reason: emailSuppressions.reason })
        .from(emailSuppressions)
        .where(
          and(
            eq(emailSuppressions.tenantId, tenantId),
            eq(emailSuppressions.email, normalizedEmail),
          ),
        );

      if (suppression) {
        logger.info(
          { enrollmentId: enrollment.id, contactId, reason: suppression.reason },
          "[seq-tick] suppressed contact skipped",
        );
        await db
          .update(emailSequenceEnrollments)
          .set({ status: "exited", updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      const [preference] = await db
        .select({ marketingOptIn: emailPreferences.marketingOptIn })
        .from(emailPreferences)
        .where(
          and(eq(emailPreferences.tenantId, tenantId), eq(emailPreferences.email, normalizedEmail)),
        );

      if (preference?.marketingOptIn === false) {
        logger.info(
          { enrollmentId: enrollment.id, contactId },
          "[seq-tick] opted-out contact skipped",
        );
        await db
          .update(emailSequenceEnrollments)
          .set({ status: "exited", updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      const vars = {
        first_name: contact.firstName ?? "",
        last_name: contact.lastName ?? "",
        email: normalizedEmail,
        business_name: profile?.businessName ?? "",
      };

      const subject = interpolate(template.subject, vars);
      const baseHtml = interpolate(template.bodyHtml, vars);
      const baseText = interpolate(template.bodyText, vars);

      // 3. Create email_sends row (queued status).
      const [sendRow] = await db
        .insert(emailSends)
        .values({
          tenantId,
          enrollmentId: enrollment.id,
          contactId,
          templateId: step.template_id,
          sendKind: "sequence_step",
          status: "queued",
        })
        .returning({ id: emailSends.id });

      const unsubscribeUrl = buildUnsubscribeUrl(env.APP_URL, sendRow!.id);
      const { html, text } = withUnsubscribeFooter(baseHtml, baseText, unsubscribeUrl);
      const from = await resolveSenderAddress(tenantId);
      const replyTo = await resolveReplyToAddress(tenantId);

      if (!isUsableSenderAddress(from)) {
        logger.warn(
          { enrollmentId: enrollment.id, tenantId, from },
          "[seq-tick] Email sender is not configured for production delivery",
        );
        await db.update(emailSends).set({ status: "failed" }).where(eq(emailSends.id, sendRow!.id));
        continue;
      }

      // 4. Send via Resend (sandbox if no API key).
      let resendMessageId: string | null = null;

      if (env.RESEND_API_KEY) {
        try {
          const result = await sendViaResend({
            apiKey: env.RESEND_API_KEY,
            from,
            replyTo,
            to: normalizedEmail,
            subject,
            html,
            text,
            tags: [
              { name: "tenant_id", value: tenantId },
              { name: "enrollment_id", value: enrollment.id },
              { name: "send_id", value: sendRow!.id },
            ],
          });
          resendMessageId = result.id;
        } catch (err) {
          logger.error(
            { err: String(err), enrollmentId: enrollment.id },
            "[seq-tick] Resend send failed",
          );
          await db
            .update(emailSends)
            .set({ status: "failed" })
            .where(eq(emailSends.id, sendRow!.id));
          continue;
        }
      } else {
        logger.info(
          { enrollmentId: enrollment.id, to: normalizedEmail, subject },
          "[seq-tick] SANDBOX — email not sent (no RESEND_API_KEY)",
        );
      }

      // 5. Mark send as sent + update enrollment.
      const nextStep = currentStep + 1;
      const hasMoreSteps = nextStep < steps.length;
      const nextStepDelay = hasMoreSteps ? (steps[nextStep]?.delay_minutes ?? 0) : 0;
      const nextRunAt = new Date(Date.now() + nextStepDelay * 60 * 1000);

      await db.transaction(async (tx) => {
        await tx
          .update(emailSends)
          .set({ status: "sent", resendMessageId, sentAt: new Date() })
          .where(eq(emailSends.id, sendRow!.id));

        await tx
          .update(emailSequenceEnrollments)
          .set({
            currentStep: hasMoreSteps ? nextStep : currentStep,
            status: hasMoreSteps ? "enrolled" : "completed",
            nextRunAt,
            updatedAt: new Date(),
          })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
      });

      sent++;
      logger.info(
        {
          enrollmentId: enrollment.id,
          step: currentStep,
          to: normalizedEmail,
          sandbox: !env.RESEND_API_KEY,
        },
        "[seq-tick] email sent",
      );
    } catch (err) {
      logger.error(
        { err: String(err), enrollmentId: enrollment.id },
        "[seq-tick] error processing enrollment",
      );
    }
  }

  return sent;
}

// ─── Tick handler ─────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const [enrolled, sent] = await Promise.all([processOutboxEnrollments(), sendDueEmails()]);
  logger.info({ enrolled, sent }, "[seq-tick] tick complete");
}

// ─── Worker bootstrap ─────────────────────────────────────────────────────────

export const emailSequenceTickWorker = new Worker<EmailSequenceTickJob>(
  EMAIL_SEQUENCE_TICK_QUEUE_NAME,
  async () => {
    try {
      await tick();
    } catch (err) {
      logger.error({ err: String(err) }, "[seq-tick] tick failed");
      throw err;
    }
  },
  {
    connection,
    concurrency: 1,
  },
);

emailSequenceTickWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[seq-tick] job completed");
});

emailSequenceTickWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, "[seq-tick] job failed");
});

// Schedule the repeatable cron job once at startup (idempotent — BullMQ deduplicates by repeat key).
emailSequenceTickQueue
  .add(
    "cron",
    {},
    {
      repeat: { pattern: "*/5 * * * *" },
      jobId: "email-sequence-tick-cron",
    },
  )
  .catch((err) => {
    logger.error({ err: String(err) }, "[seq-tick] failed to schedule cron job");
  });
