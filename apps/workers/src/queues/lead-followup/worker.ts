import { db } from "@marketing/db";
import {
  businessProfiles,
  contacts,
  emailSendingDomains,
  integrationConnections,
  leads,
  messages,
  forms,
  tenants,
} from "@marketing/db";
import {
  resolveWhatsappCredentials,
  sendSmsViaAspSms,
  sendViaResend,
  sendWhatsAppText,
} from "@marketing/integrations";
import {
  buildLeadConfirmationCopy,
  computeWhatsappConversationState,
  getLeadConfirmationChannelOrder,
  buildLeadWorkflowPlan,
  env,
  isPlaceholderLeadEmail,
  logger,
  type LeadConfirmationChannel,
  normalizeLeadCaptureSettings,
} from "@marketing/shared";
import { Worker, UnrecoverableError, type Job } from "bullmq";
import { and, desc, eq } from "drizzle-orm";
import { connection, LEAD_FOLLOW_UP_QUEUE_NAME, type LeadFollowUpJob } from "./queue";

type LeadFollowUpContext = {
  tenantId: string;
  leadId: string;
  contactId: string;
  status: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  form: {
    id: string;
    name: string;
    slug: string;
    submitLabel: string | null;
    steps: unknown;
    schema: unknown;
  };
  contact: {
    id: string;
    email: string;
    phone: string | null;
    lifecycleStage: string;
  };
  businessName: string;
  locale: string;
  leadCaptureSettings: ReturnType<typeof normalizeLeadCaptureSettings>;
  tenantSlug: string | null;
};

type SendAttemptResult =
  | {
      ok: true;
      channel: LeadConfirmationChannel;
      fromAddress: string;
      toAddress: string;
      body: string;
      externalId: string | null;
      policyState?: string | null;
      sandbox?: boolean;
    }
  | {
      ok: false;
      channel: LeadConfirmationChannel;
      fromAddress: string;
      toAddress: string;
      body: string;
      error: string;
      policyState?: string | null;
      templateRequired?: boolean;
    };

function asPayloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

async function loadLeadFollowUpContext(
  tenantId: string,
  leadId: string,
): Promise<LeadFollowUpContext> {
  const [lead] = await db
    .select({
      id: leads.id,
      tenantId: leads.tenantId,
      formId: leads.formId,
      contactId: leads.contactId,
      status: leads.status,
      payload: leads.payload,
      sourceUrl: leads.sourceUrl,
    })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));

  if (!lead) {
    throw new UnrecoverableError(`Lead ${leadId} not found`);
  }

  if (!lead.contactId) {
    throw new UnrecoverableError(`Lead ${leadId} has no contact`);
  }

  const [[form], [contact], [profile], [tenant]] = await Promise.all([
    db
      .select({
        id: forms.id,
        name: forms.name,
        slug: forms.slug,
        submitLabel: forms.submitLabel,
        steps: forms.steps,
        schema: forms.schema,
      })
      .from(forms)
      .where(and(eq(forms.tenantId, tenantId), eq(forms.id, lead.formId))),
    db
      .select({
        id: contacts.id,
        email: contacts.email,
        phone: contacts.phone,
        lifecycleStage: contacts.lifecycleStage,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, lead.contactId))),
    db
      .select({
        businessName: businessProfiles.businessName,
        locale: businessProfiles.locale,
        leadCaptureSettings: businessProfiles.leadCaptureSettings,
      })
      .from(businessProfiles)
      .where(eq(businessProfiles.tenantId, tenantId)),
    db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)),
  ]);

  if (!form) {
    throw new UnrecoverableError(`Form ${lead.formId} not found`);
  }

  if (!contact) {
    throw new UnrecoverableError(`Contact ${lead.contactId} not found`);
  }

  const payload = asPayloadRecord(lead.payload);

  return {
    tenantId,
    leadId,
    contactId: contact.id,
    status: lead.status,
    payload,
    sourceUrl: lead.sourceUrl ?? null,
    form,
    contact,
    businessName: profile?.businessName ?? "our team",
    locale: profile?.locale ?? "en",
    leadCaptureSettings: normalizeLeadCaptureSettings(profile?.leadCaptureSettings),
    tenantSlug: tenant?.slug ?? null,
  };
}

async function resolveWhatsAppCredentials(ctx: LeadFollowUpContext): Promise<{
  accessToken: string;
  phoneNumberId: string;
} | null> {
  const [conn] = await db
    .select({
      oauthTokens: integrationConnections.oauthTokens,
      meta: integrationConnections.meta,
    })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.tenantId, ctx.tenantId),
        eq(integrationConnections.provider, "meta"),
      ),
    );

  const resolved = resolveWhatsappCredentials({
    tenantSlug: ctx.tenantSlug,
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

  return resolved
    ? {
        accessToken: resolved.accessToken,
        phoneNumberId: resolved.phoneNumberId,
      }
    : null;
}

async function trySendEmail(
  ctx: LeadFollowUpContext,
  copy: ReturnType<typeof buildLeadConfirmationCopy>,
): Promise<SendAttemptResult | null> {
  if (!ctx.contact.email || isPlaceholderLeadEmail(ctx.contact.email)) {
    return null;
  }
  const from = await resolveSenderAddress(ctx.tenantId);
  const bodyHtml = `<p>${copy.body}</p>`;

  if (!env.RESEND_API_KEY) {
    return {
      ok: true,
      channel: "email",
      fromAddress: from,
      toAddress: ctx.contact.email,
      body: copy.body,
      externalId: null,
      sandbox: true,
    };
  }

  try {
    const result = await sendViaResend({
      apiKey: env.RESEND_API_KEY,
      from,
      to: ctx.contact.email,
      subject: copy.subject,
      html: bodyHtml,
      text: copy.body,
      tags: [
        { name: "tenant_id", value: ctx.tenantId },
        { name: "lead_id", value: ctx.leadId },
      ],
    });
    return {
      ok: true,
      channel: "email",
      fromAddress: from,
      toAddress: ctx.contact.email,
      body: copy.body,
      externalId: result.id,
    };
  } catch (err) {
    return {
      ok: false,
      channel: "email",
      fromAddress: from,
      toAddress: ctx.contact.email,
      body: copy.body,
      error: String(err),
    };
  }
}

async function trySendWhatsApp(
  ctx: LeadFollowUpContext,
  copy: ReturnType<typeof buildLeadConfirmationCopy>,
): Promise<SendAttemptResult | null> {
  if (!ctx.contact.phone) return null;

  const wa = await resolveWhatsAppCredentials(ctx);
  if (!wa) return null;

  const [lastInbound] = await db
    .select({ occurredAt: messages.occurredAt })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, ctx.tenantId),
        eq(messages.contactId, ctx.contactId),
        eq(messages.channel, "whatsapp"),
        eq(messages.direction, "inbound"),
      ),
    )
    .orderBy(desc(messages.occurredAt))
    .limit(1);

  const conversationState = computeWhatsappConversationState(lastInbound?.occurredAt ?? null);
  if (!conversationState.serviceWindowOpen) {
    return {
      ok: false,
      channel: "whatsapp",
      fromAddress: wa.phoneNumberId,
      toAddress: ctx.contact.phone,
      body: copy.shortBody,
      error:
        "Outside the 24-hour WhatsApp service window. Template sending is required for this follow-up.",
      policyState: conversationState.policy,
      templateRequired: true,
    };
  }

  try {
    const result = await sendWhatsAppText(
      wa.phoneNumberId,
      wa.accessToken,
      ctx.contact.phone,
      copy.shortBody,
    );
    return {
      ok: true,
      channel: "whatsapp",
      fromAddress: wa.phoneNumberId,
      toAddress: ctx.contact.phone,
      body: copy.shortBody,
      externalId: result.messageId,
      policyState: conversationState.policy,
    };
  } catch (err) {
    return {
      ok: false,
      channel: "whatsapp",
      fromAddress: wa.phoneNumberId,
      toAddress: ctx.contact.phone,
      body: copy.shortBody,
      error: String(err),
      policyState: conversationState.policy,
    };
  }
}

async function trySendSms(
  ctx: LeadFollowUpContext,
  copy: ReturnType<typeof buildLeadConfirmationCopy>,
): Promise<SendAttemptResult | null> {
  if (!ctx.contact.phone || !env.ASPSMS_USER_KEY || !env.ASPSMS_PASSWORD) {
    return null;
  }

  try {
    await sendSmsViaAspSms({
      userKey: env.ASPSMS_USER_KEY,
      password: env.ASPSMS_PASSWORD,
      originator: env.ASPSMS_ORIGINATOR,
      to: ctx.contact.phone,
      text: copy.shortBody,
    });
    return {
      ok: true,
      channel: "sms",
      fromAddress: env.ASPSMS_ORIGINATOR,
      toAddress: ctx.contact.phone,
      body: copy.shortBody,
      externalId: null,
    };
  } catch (err) {
    return {
      ok: false,
      channel: "sms",
      fromAddress: env.ASPSMS_ORIGINATOR,
      toAddress: ctx.contact.phone,
      body: copy.shortBody,
      error: String(err),
    };
  }
}

async function recordAttempt(ctx: LeadFollowUpContext, attempt: SendAttemptResult): Promise<void> {
  await db.insert(messages).values({
    tenantId: ctx.tenantId,
    contactId: ctx.contactId,
    channel: attempt.channel,
    direction: "outbound",
    fromAddress: attempt.fromAddress,
    toAddress: attempt.toAddress,
    body: attempt.body,
    status: attempt.ok ? "sent" : "failed",
    policyState: attempt.policyState ?? null,
    errorMessage: attempt.ok ? null : attempt.error,
    meta: {
      automated: true,
      leadId: ctx.leadId,
      templateRequired: attempt.ok ? false : attempt.templateRequired === true,
      sandbox: attempt.ok ? attempt.sandbox === true : false,
    },
    externalId: attempt.ok ? attempt.externalId : null,
  });
}

async function processLeadFollowUp(job: Job<LeadFollowUpJob>): Promise<void> {
  const ctx = await loadLeadFollowUpContext(job.data.tenantId, job.data.leadId);
  if (ctx.status !== "new") {
    logger.debug({ leadId: ctx.leadId, status: ctx.status }, "[lead-follow-up] already progressed");
    return;
  }

  if (!ctx.leadCaptureSettings.autoAcknowledgementEnabled) {
    logger.info({ leadId: ctx.leadId }, "[lead-follow-up] auto acknowledgement disabled");
    return;
  }

  const workflowPlan = buildLeadWorkflowPlan(ctx.form, ctx.payload, ctx.sourceUrl);
  const copy = buildLeadConfirmationCopy({
    kind: workflowPlan.kind,
    businessName: ctx.businessName,
    locale: ctx.locale,
    payload: ctx.payload,
    settings: ctx.leadCaptureSettings,
  });

  const attemptFactories: Record<LeadConfirmationChannel, () => Promise<SendAttemptResult | null>> =
    {
      email: () => trySendEmail(ctx, copy),
      whatsapp: () => trySendWhatsApp(ctx, copy),
      sms: () => trySendSms(ctx, copy),
    };

  const attempts: SendAttemptResult[] = [];
  for (const channel of getLeadConfirmationChannelOrder(
    ctx.leadCaptureSettings.preferredConfirmationChannel,
  )) {
    const attempt = await attemptFactories[channel]();
    if (attempt) attempts.push(attempt);
  }

  if (attempts.length === 0) {
    logger.info({ leadId: ctx.leadId }, "[lead-follow-up] no confirmation channel available");
    return;
  }

  for (const attempt of attempts) {
    await recordAttempt(ctx, attempt);

    if (!attempt.ok) {
      logger.warn(
        { leadId: ctx.leadId, channel: attempt.channel, error: attempt.error },
        "[lead-follow-up] send attempt failed",
      );
      continue;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(leads)
        .set({ status: "contacted" })
        .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.id, ctx.leadId)));

      if (ctx.contact.lifecycleStage === "subscriber") {
        await tx
          .update(contacts)
          .set({ lifecycleStage: "lead", updatedAt: new Date() })
          .where(and(eq(contacts.tenantId, ctx.tenantId), eq(contacts.id, ctx.contactId)));
      }
    });

    logger.info(
      {
        leadId: ctx.leadId,
        channel: attempt.channel,
        sandbox: attempt.sandbox ?? false,
      },
      "[lead-follow-up] confirmation sent",
    );
    return;
  }
}

export const leadFollowUpWorker = new Worker<LeadFollowUpJob>(
  LEAD_FOLLOW_UP_QUEUE_NAME,
  async (job) => {
    try {
      await processLeadFollowUp(job);
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      logger.error({ err: String(err), jobId: job.id }, "[lead-follow-up] job failed");
      throw err;
    }
  },
  {
    connection,
    concurrency: 10,
  },
);

leadFollowUpWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[lead-follow-up] job completed");
});

leadFollowUpWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, "[lead-follow-up] job failed permanently");
});
