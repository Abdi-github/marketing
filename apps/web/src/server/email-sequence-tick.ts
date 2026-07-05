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
  type SequenceStep,
  type SequenceTriggerFilter,
} from "@marketing/db";
import { interpolate, sendViaResend } from "@marketing/integrations";
import { env, logger } from "@marketing/shared";
import { and, eq, isNull, lte, sql } from "drizzle-orm";

const TRIGGER_EVENT_TYPES = ["lead.captured", "contact.score_changed", "contact.lifecycle_changed"];

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function buildUnsubscribeUrl(sendId: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/api/email/preferences?send_id=${encodeURIComponent(sendId)}`;
}

function withUnsubscribeFooter(html: string, text: string, unsubscribeUrl: string) {
  const footerHtml = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px" /><p style="font-size:12px;line-height:1.5;color:#6b7280">You are receiving this email because you contacted this business or subscribed to updates. <a href="${unsubscribeUrl}" style="color:#2563eb">Manage preferences or unsubscribe</a></p>`;
  const htmlWithFooter = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${footerHtml}</body>`)
    : `${html}${footerHtml}`;
  const textWithFooter = `${text.trim()}\n\nManage preferences or unsubscribe: ${unsubscribeUrl}`;
  return { html: htmlWithFooter, text: textWithFooter };
}

function matchesTriggerFilter(
  eventType: string,
  payload: Record<string, unknown>,
  filter: SequenceTriggerFilter,
): boolean {
  if (eventType === "lead.captured") {
    if (filter.lifecycle_stage && payload.lifecycleStage !== filter.lifecycle_stage) return false;
    if (filter.leadKind && payload.leadKind !== filter.leadKind) return false;
    if (filter.sourceChannel && payload.sourceChannel !== filter.sourceChannel) return false;
    if (filter.formId && payload.formId !== filter.formId) return false;
    if (filter.landingPageId && payload.landingPageId !== filter.landingPageId) return false;
    if (filter.requireMarketingConsent && payload.marketingConsent !== true) return false;
    return true;
  }
  if (eventType === "contact.score_changed") {
    if (filter.min_delta !== undefined) {
      const delta = typeof payload.delta === "number" ? payload.delta : 0;
      if (delta < filter.min_delta) return false;
    }
    if (filter.min_score !== undefined) {
      const score = typeof payload.newScore === "number" ? payload.newScore : 0;
      if (score < filter.min_score) return false;
    }
    return true;
  }
  if (eventType === "contact.lifecycle_changed") {
    if (filter.lifecycle_stage && payload.newStage !== filter.lifecycle_stage) return false;
    return true;
  }
  return true;
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

async function resolveReplyToAddress(tenantId: string): Promise<string | undefined> {
  const [profile] = await db
    .select({ emailReplyTo: businessProfiles.emailReplyTo })
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, tenantId));

  const configuredReplyTo = profile?.emailReplyTo?.trim();
  if (configuredReplyTo) return configuredReplyTo;

  const [owner] = await db
    .select({ email: users.email })
    .from(tenantUsers)
    .innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.role, "owner")));

  return owner?.email;
}

function isUsableSenderAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const email = normalized.match(/<([^>]+)>/)?.[1] ?? normalized;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".localhost");
}

function buildEmailSendIdempotencyKey(enrollmentId: string, stepIndex: number): string {
  return `email-sequence:${enrollmentId}:step:${stepIndex}`;
}

function isMarketingEmail(input: {
  sequencePurpose?: string | null;
  sequenceConsentRequired?: boolean | null;
  templatePurpose?: string | null;
  templateConsentRequired?: boolean | null;
  triggerFilter?: SequenceTriggerFilter | null;
}): boolean {
  return (
    input.sequencePurpose === "marketing" ||
    input.templatePurpose === "marketing" ||
    input.sequenceConsentRequired === true ||
    input.templateConsentRequired === true ||
    input.triggerFilter?.requireMarketingConsent === true
  );
}

async function recordSkippedSend(input: {
  tenantId: string;
  enrollmentId: string;
  contactId: string;
  templateId: string;
  stepIndex: number;
  idempotencyKey: string;
  reason: string;
}): Promise<void> {
  await db
    .insert(emailSends)
    .values({
      tenantId: input.tenantId,
      enrollmentId: input.enrollmentId,
      contactId: input.contactId,
      templateId: input.templateId,
      stepIndex: input.stepIndex,
      idempotencyKey: input.idempotencyKey,
      sendKind: "sequence_step",
      status: "skipped",
      providerStatus: "skipped",
      failureReason: input.reason,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function processEmailSequenceOutboxEnrollments(): Promise<number> {
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
      await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
      continue;
    }

    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    if (!contact) {
      logger.warn({ eventId: event.eventId, contactId }, "[email-cron] contact missing");
      await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
      continue;
    }

    try {
      await db.insert(eventProcessed).values({
        eventId: event.eventId,
        handlerName: "email-sequence-enroller",
      });
    } catch {
      await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
      continue;
    }

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

      const firstStepDelay = steps[0]?.delay_minutes ?? 0;
      const nextRunAt = new Date(Date.now() + firstStepDelay * 60 * 1000);

      await db
        .insert(emailSequenceEnrollments)
        .values({ tenantId, sequenceId: seq.id, contactId, nextRunAt })
        .onConflictDoNothing();
      enrolled++;
    }

    await db.update(outbox).set({ publishedAt: new Date() }).where(eq(outbox.id, event.id));
  }

  return enrolled;
}

export async function sendDueEmailSequenceSteps(): Promise<number> {
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
      const [seq] = await db
        .select({
          steps: emailSequences.steps,
          status: emailSequences.status,
          purpose: emailSequences.purpose,
          consentRequired: emailSequences.consentRequired,
          triggerFilter: emailSequences.triggerFilter,
        })
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
      const idempotencyKey = buildEmailSendIdempotencyKey(enrollment.id, currentStep);

      if (!step) {
        await db
          .update(emailSequenceEnrollments)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      const [existingSend] = await db
        .select({ id: emailSends.id, status: emailSends.status })
        .from(emailSends)
        .where(
          and(eq(emailSends.tenantId, tenantId), eq(emailSends.idempotencyKey, idempotencyKey)),
        );

      if (
        existingSend &&
        ["queued", "sent", "delivered", "bounced", "complained"].includes(existingSend.status)
      ) {
        const nextStep = currentStep + 1;
        const hasMoreSteps = nextStep < steps.length;
        const nextStepDelay = hasMoreSteps ? (steps[nextStep]?.delay_minutes ?? 0) : 0;
        await db
          .update(emailSequenceEnrollments)
          .set({
            currentStep: hasMoreSteps ? nextStep : currentStep,
            status: hasMoreSteps ? "enrolled" : "completed",
            nextRunAt: new Date(Date.now() + nextStepDelay * 60 * 1000),
            updatedAt: new Date(),
          })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        continue;
      }

      const [[template], [contact], [profile]] = await Promise.all([
        db
          .select({
            subject: emailTemplates.subject,
            bodyHtml: emailTemplates.bodyHtml,
            bodyText: emailTemplates.bodyText,
            purpose: emailTemplates.purpose,
            consentRequired: emailTemplates.consentRequired,
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
        await recordSkippedSend({
          tenantId,
          enrollmentId: enrollment.id,
          contactId,
          templateId: step.template_id,
          stepIndex: currentStep,
          idempotencyKey,
          reason: `Suppressed email address (${suppression.reason}).`,
        });
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

      const requiresMarketingConsent = isMarketingEmail({
        sequencePurpose: seq.purpose,
        sequenceConsentRequired: seq.consentRequired,
        templatePurpose: template.purpose,
        templateConsentRequired: template.consentRequired,
        triggerFilter: (seq.triggerFilter ?? {}) as SequenceTriggerFilter,
      });

      if (
        preference?.marketingOptIn === false ||
        (requiresMarketingConsent && preference?.marketingOptIn !== true)
      ) {
        await recordSkippedSend({
          tenantId,
          enrollmentId: enrollment.id,
          contactId,
          templateId: step.template_id,
          stepIndex: currentStep,
          idempotencyKey,
          reason: requiresMarketingConsent
            ? "Marketing email requires opt-in."
            : "Contact opted out of email.",
        });
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

      const [sendRow] = await db
        .insert(emailSends)
        .values({
          tenantId,
          enrollmentId: enrollment.id,
          contactId,
          templateId: step.template_id,
          stepIndex: currentStep,
          idempotencyKey,
          sendKind: "sequence_step",
          status: "queued",
          providerStatus: "queued",
        })
        .onConflictDoNothing()
        .returning({ id: emailSends.id });

      const sendId = sendRow?.id ?? existingSend?.id;
      if (!sendId) continue;

      const unsubscribeUrl = buildUnsubscribeUrl(sendId);
      const { html, text } = withUnsubscribeFooter(baseHtml, baseText, unsubscribeUrl);
      const from = await resolveSenderAddress(tenantId);
      const replyTo = await resolveReplyToAddress(tenantId);

      if (!isUsableSenderAddress(from)) {
        await db
          .update(emailSends)
          .set({
            status: "failed",
            providerStatus: "configuration_error",
            failureReason:
              "Email sender is not configured. Configure the platform sender or verify a sending domain.",
            updatedAt: new Date(),
          })
          .where(eq(emailSends.id, sendId));
        continue;
      }

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
              { name: "send_id", value: sendId },
            ],
          });
          resendMessageId = result.id;
        } catch (err) {
          await db
            .update(emailSends)
            .set({
              status: "failed",
              providerStatus: "provider_rejected",
              failureReason: err instanceof Error ? err.message : String(err),
              updatedAt: new Date(),
            })
            .where(eq(emailSends.id, sendId));
          continue;
        }
      } else {
        logger.info({ enrollmentId: enrollment.id, to: normalizedEmail }, "[email-cron] sandbox");
      }

      const nextStep = currentStep + 1;
      const hasMoreSteps = nextStep < steps.length;
      const nextStepDelay = hasMoreSteps ? (steps[nextStep]?.delay_minutes ?? 0) : 0;
      const nextRunAt = new Date(Date.now() + nextStepDelay * 60 * 1000);

      await db.transaction(async (tx) => {
        await tx
          .update(emailSends)
          .set({
            status: "sent",
            providerStatus: resendMessageId ? "accepted" : "sandbox",
            resendMessageId,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailSends.id, sendId));

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
    } catch (err) {
      logger.error({ err: String(err), enrollmentId: enrollment.id }, "[email-cron] tick failed");
    }
  }

  return sent;
}

export async function processEmailSequenceTick(): Promise<{ enrolled: number; sent: number }> {
  const [enrolled, sent] = await Promise.all([
    processEmailSequenceOutboxEnrollments(),
    sendDueEmailSequenceSteps(),
  ]);
  logger.info({ enrolled, sent }, "[email-cron] tick complete");
  return { enrolled, sent };
}
