// WhatsApp inbound message worker.
// Triggered by /api/webhooks/whatsapp for each incoming message.
// Captures the lead in CRM, stores inbox history, creates follow-up work,
// and sends a policy-safe acknowledgment when possible.
import { createAnthropicHaiku, EchoProvider, getPrompt } from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  businessProfiles,
  contacts,
  crmTasks,
  forms,
  integrationConnections,
  leads,
  messages,
  outbox,
  tenants,
} from "@marketing/db";
import {
  getWhatsAppTestModeConfig as _getWhatsAppTestModeConfig,
  isWhatsAppTestModeTenant as _isWhatsAppTestModeTenant,
  resolveWhatsappCredentials,
  sendWhatsAppText,
} from "@marketing/integrations";
import {
  buildLeadConfirmationCopy,
  buildLeadTaskDueAt,
  buildLeadWorkflowPlan,
  computeWhatsappConversationState,
  env,
  extractWhatsappLeadFacts,
  logger,
  mapLeadWorkflowKindToWhatsappIntent,
  normalizeLeadCaptureSettings,
  splitContactName,
  type WhatsappInboundIntent,
  type WhatsappLeadFacts,
} from "@marketing/shared";
import { UnrecoverableError, Worker } from "bullmq";
import type { Job } from "bullmq";
import { and, desc, eq, sql } from "drizzle-orm";
import { connection, WHATSAPP_INBOUND_QUEUE_NAME } from "./queue";
import type { WhatsappInboundJob } from "./queue";

function buildProvider() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
    return new EchoProvider();
  }
  return createAnthropicHaiku();
}

const WHATSAPP_INBOUND_FORM = {
  name: "WhatsApp inbound",
  slug: "whatsapp-inbound",
  submitLabel: "Send WhatsApp",
  schema: {
    type: "object",
    properties: {
      message: { type: "string" },
      phone: { type: "string" },
      date: { type: "string" },
      time: { type: "string" },
      party_size: { type: "number" },
      location: { type: "string" },
    },
  },
} as const;

function normalizePhone(value: string): string {
  return value.startsWith("+") ? value : `+${value}`;
}

function _looksLikeRestaurant(vertical?: string | null): boolean {
  return /restaurant|cafe|café|bar|bistro|hotel/.test((vertical ?? "").toLowerCase());
}

function buildStructuredPayload(
  facts: WhatsappLeadFacts,
  fallbackText: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    phone: facts.phone ?? null,
    message: facts.message ?? fallbackText ?? "",
  };
  if (facts.customerName) payload["name"] = facts.customerName;
  if (facts.email) payload["email"] = facts.email;
  if (facts.reservationDate) payload["date"] = facts.reservationDate;
  if (facts.reservationTime) payload["time"] = facts.reservationTime;
  if (facts.partySize) payload["party_size"] = facts.partySize;
  if (facts.locationLabel) payload["location"] = facts.locationLabel;
  if (facts.buttonReply) payload["button_reply"] = facts.buttonReply;
  if (facts.interactiveId) payload["interactive_id"] = facts.interactiveId;
  return payload;
}

function needsReservationDetails(facts: WhatsappLeadFacts): boolean {
  return !facts.reservationDate || !facts.reservationTime || !facts.partySize;
}

function buildWorkflowState(intent: WhatsappInboundIntent, facts: WhatsappLeadFacts): string {
  if (facts.needsManualReview) return "manual_review";
  if (intent === "reservation" || intent === "appointment") {
    return needsReservationDetails(facts) ? "missing_details" : "awaiting_confirmation";
  }
  return "received";
}

function buildFallbackAcknowledgement(input: {
  intent: WhatsappInboundIntent;
  facts: WhatsappLeadFacts;
  businessName: string;
  locale: string;
  settings: ReturnType<typeof normalizeLeadCaptureSettings>;
  payload: Record<string, unknown>;
}): string {
  if (input.facts.needsManualReview) {
    return input.locale === "de-CH"
      ? `Danke fuer Ihre Nachricht an ${input.businessName}. Wir haben Ihren Anhang erhalten und melden uns so bald wie moeglich.`
      : `Thanks for contacting ${input.businessName}. We received your attachment and will get back to you shortly.`;
  }

  const leadKind =
    input.intent === "reservation" || input.intent === "appointment"
      ? "booking"
      : input.intent === "callback"
        ? "callback"
        : input.intent === "quote"
          ? "quote"
          : "generic";

  return buildLeadConfirmationCopy({
    kind: leadKind,
    businessName: input.businessName,
    locale: input.locale,
    payload: input.payload,
    settings: input.settings,
  }).shortBody;
}

async function upsertIntegrationHealthMeta(
  tenantId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const [connectionRow] = await db
    .select({
      id: integrationConnections.id,
      meta: integrationConnections.meta,
    })
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.tenantId, tenantId),
        eq(integrationConnections.provider, "meta"),
      ),
    )
    .limit(1);

  if (!connectionRow) return;

  await db
    .update(integrationConnections)
    .set({
      meta: {
        ...(connectionRow.meta as Record<string, unknown> | null),
        ...patch,
      },
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionRow.id));
}

async function ensureWhatsappSystemForm(tenantId: string): Promise<string> {
  const [existing] = await db
    .select({ id: forms.id })
    .from(forms)
    .where(
      and(
        eq(forms.tenantId, tenantId),
        sql`${forms.settings}->>'system_kind' = 'whatsapp_inbound'`,
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(forms)
    .values({
      tenantId,
      name: "WhatsApp Inbox",
      slug: "whatsapp-inbox",
      schema: WHATSAPP_INBOUND_FORM.schema,
      settings: {
        system_kind: "whatsapp_inbound",
        hidden: true,
        honeypot: false,
        turnstile_enabled: false,
      },
      submitLabel: "Open WhatsApp",
      isActive: false,
    })
    .onConflictDoNothing()
    .returning({ id: forms.id });

  if (created) return created.id;

  const [raceWinner] = await db
    .select({ id: forms.id })
    .from(forms)
    .where(
      and(
        eq(forms.tenantId, tenantId),
        sql`${forms.settings}->>'system_kind' = 'whatsapp_inbound'`,
      ),
    )
    .limit(1);

  if (!raceWinner) {
    throw new UnrecoverableError("Could not create internal WhatsApp form");
  }

  return raceWinner.id;
}

async function ensureContact(
  tenantId: string,
  facts: WhatsappLeadFacts,
): Promise<{
  id: string;
  firstName: string | null;
  lifecycleStage: string;
}> {
  const phone = facts.phone;
  if (!phone) {
    throw new UnrecoverableError("WhatsApp contact phone is missing");
  }

  let [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lifecycleStage: contacts.lifecycleStage,
      email: contacts.email,
      lastName: contacts.lastName,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, phone)))
    .limit(1);

  const nameParts = splitContactName({ name: facts.customerName ?? undefined });

  if (!contact) {
    const [inserted] = await db
      .insert(contacts)
      .values({
        tenantId,
        email: facts.email ?? `wa-${phone.replace(/[^\d+]/g, "")}@noreply.whatsapp`,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        phone,
        source: "whatsapp",
        lifecycleStage: "subscriber",
      })
      .returning({
        id: contacts.id,
        firstName: contacts.firstName,
        lifecycleStage: contacts.lifecycleStage,
      });
    contact = {
      ...inserted!,
      email: facts.email ?? `wa-${phone.replace(/[^\d+]/g, "")}@noreply.whatsapp`,
      lastName: nameParts.lastName,
      phone,
    };
  } else {
    await db
      .update(contacts)
      .set({
        firstName: contact.firstName ?? nameParts.firstName,
        lastName: contact.lastName ?? nameParts.lastName,
        email:
          facts.email && contact.email.endsWith("@noreply.whatsapp") ? facts.email : contact.email,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contact.id)));
  }

  return {
    id: contact.id,
    firstName: contact.firstName,
    lifecycleStage: contact.lifecycleStage,
  };
}

async function createWhatsappLead(input: {
  tenantId: string;
  contactId: string;
  formId: string;
  payload: Record<string, unknown>;
  workflowKind: string;
  workflowState: string;
  structuredData: Record<string, unknown>;
}): Promise<string> {
  const [lead] = await db
    .insert(leads)
    .values({
      tenantId: input.tenantId,
      formId: input.formId,
      contactId: input.contactId,
      payload: input.payload,
      status: "new",
      workflowKind: input.workflowKind,
      workflowState: input.workflowState,
      sourceChannel: "whatsapp",
      structuredData: input.structuredData,
      sourceUrl: "whatsapp://inbound",
      lastAutomationAt: new Date(),
    })
    .returning({ id: leads.id });

  return lead!.id;
}

async function processWhatsappInbound(job: Job<WhatsappInboundJob>): Promise<void> {
  const { tenantId, phoneNumberId, from, text, bodyPreview, messageId, messageType, meta } =
    job.data;

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  if (!tenant) {
    throw new UnrecoverableError(`Tenant ${tenantId} not found`);
  }

  const [existingInbound] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.channel, "whatsapp"),
        eq(messages.direction, "inbound"),
        eq(messages.externalId, messageId),
      ),
    )
    .limit(1);

  if (existingInbound) {
    logger.debug({ tenantId, messageId }, "[wa-inbound] duplicate webhook ignored");
    return;
  }

  const phoneNormalized = normalizePhone(from);

  const [profile] = await db
    .select({
      businessName: businessProfiles.businessName,
      locale: businessProfiles.locale,
      vertical: businessProfiles.vertical,
      leadCaptureSettings: businessProfiles.leadCaptureSettings,
    })
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, tenantId))
    .limit(1);

  const facts = extractWhatsappLeadFacts({
    payload: null,
    text,
    phone: phoneNormalized,
    meta,
  });
  const payload = buildStructuredPayload(facts, text ?? bodyPreview);
  const workflowPlan = buildLeadWorkflowPlan(WHATSAPP_INBOUND_FORM, payload, "whatsapp://inbound");
  const whatsappIntent = facts.needsManualReview
    ? "manual_review"
    : mapLeadWorkflowKindToWhatsappIntent(workflowPlan.kind, profile?.vertical);
  const workflowState = buildWorkflowState(whatsappIntent, facts);
  const settings = normalizeLeadCaptureSettings(profile?.leadCaptureSettings);
  const formId = await ensureWhatsappSystemForm(tenantId);
  const contact = await ensureContact(tenantId, facts);

  await db.insert(messages).values({
    tenantId,
    contactId: contact.id,
    channel: "whatsapp",
    direction: "inbound",
    fromAddress: phoneNormalized,
    toAddress: phoneNumberId,
    body: bodyPreview,
    messageType,
    meta: {
      ...meta,
      rawText: text,
      extractedFacts: facts,
      workflowKind: workflowPlan.kind,
      whatsappIntent,
    },
    status: "delivered",
    policyState: "session",
    externalId: messageId,
    occurredAt: new Date(job.data.timestamp * 1000),
  });

  await upsertIntegrationHealthMeta(tenantId, {
    lastInboundAt: new Date(job.data.timestamp * 1000).toISOString(),
    lastInboundFrom: phoneNormalized,
    lastInboundType: messageType,
  });

  const leadId = await createWhatsappLead({
    tenantId,
    contactId: contact.id,
    formId,
    payload,
    workflowKind: workflowPlan.kind,
    workflowState,
    structuredData: {
      source: "whatsapp",
      intent: whatsappIntent,
      facts,
      messageType,
    },
  });

  let taskId: string | null = null;
  if (workflowPlan.kind !== "generic" || facts.needsManualReview) {
    const taskTitle =
      whatsappIntent === "reservation"
        ? "Confirm restaurant reservation"
        : whatsappIntent === "appointment"
          ? "Confirm appointment request"
          : facts.needsManualReview
            ? "Review WhatsApp attachment"
            : workflowPlan.title;
    const [task] = await db
      .insert(crmTasks)
      .values({
        tenantId,
        contactId: contact.id,
        title: taskTitle,
        body: workflowPlan.body,
        meta: {
          sourceChannel: "whatsapp",
          workflowKind: workflowPlan.kind,
          whatsappIntent,
          workflowState,
          leadId,
          messageId,
          facts,
        },
        dueAt: buildLeadTaskDueAt(workflowPlan),
        priority: facts.needsManualReview ? "high" : workflowPlan.priority,
      })
      .returning({ id: crmTasks.id });
    taskId = task?.id ?? null;
  }

  if (contact.lifecycleStage === "subscriber") {
    await db
      .update(contacts)
      .set({
        lifecycleStage: "lead",
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contact.id)));
  }

  const [lastInbound] = await db
    .select({ occurredAt: messages.occurredAt })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.contactId, contact.id),
        eq(messages.channel, "whatsapp"),
        eq(messages.direction, "inbound"),
      ),
    )
    .orderBy(desc(messages.occurredAt))
    .limit(1);

  const conversationState = computeWhatsappConversationState(lastInbound?.occurredAt ?? null);

  const [conn] = await db
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
    .limit(1);

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
  const targetPhoneId = credentials?.phoneNumberId ?? phoneNumberId;

  const prompt = getPrompt("whatsapp-greeter-v1");
  const provider = buildProvider();
  let replyText = buildFallbackAcknowledgement({
    intent: whatsappIntent,
    facts,
    businessName: profile?.businessName ?? tenant.name,
    locale: profile?.locale ?? "de-CH",
    settings,
    payload,
  });

  const canUseAiGreeter =
    workflowPlan.kind === "generic" &&
    !facts.needsManualReview &&
    (messageType === "text" || messageType === "button" || messageType === "interactive");

  if (canUseAiGreeter && provider.complete) {
    const userPromptStr = prompt.buildUserPrompt({
      businessName: profile?.businessName ?? tenant.name,
      vertical: profile?.vertical ?? "local business",
      city: "",
      locale: profile?.locale ?? "de-CH",
      inboundText: text ?? bodyPreview,
    });

    try {
      const result = await provider.complete(
        {
          prompt: userPromptStr,
          systemPrompt: prompt.systemPrompt,
          maxTokens: 256,
        },
        {
          tenantId,
          jobId: job.id ?? crypto.randomUUID(),
          promptId: "whatsapp-greeter-v1",
          promptVersion: 1,
          costBudgetCents: 3,
        },
      );
      if (result.text?.trim()) {
        replyText = result.text.trim();
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "[wa-inbound] greeter AI failed, using fallback");
    }
  }

  let externalReplyId: string | null = null;
  let replyStatus: "sent" | "failed" = "failed";
  let replyError: string | null = null;

  if (!credentials) {
    replyError = "WhatsApp is not connected for this tenant.";
  } else if (!conversationState.serviceWindowOpen) {
    replyError = "Outside the 24-hour WhatsApp service window.";
  } else {
    try {
      const sent = await sendWhatsAppText(targetPhoneId, credentials.accessToken, from, replyText);
      externalReplyId = sent.messageId;
      replyStatus = "sent";
    } catch (err) {
      replyError = String(err);
      logger.warn({ err: replyError }, "[wa-inbound] failed to send WA reply");
    }
  }

  await db.insert(messages).values({
    tenantId,
    contactId: contact.id,
    channel: "whatsapp",
    direction: "outbound",
    fromAddress: targetPhoneId,
    toAddress: phoneNormalized,
    body: replyText,
    messageType: "text",
    meta: {
      automated: true,
      leadId,
      workflowKind: workflowPlan.kind,
      whatsappIntent,
    },
    status: replyStatus,
    policyState: conversationState.policy,
    errorMessage: replyError,
    externalId: externalReplyId,
  });

  await db
    .update(leads)
    .set({
      status: replyStatus === "sent" ? "contacted" : "new",
      lastAutomationAt: new Date(),
      workflowState,
    })
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));

  await upsertIntegrationHealthMeta(
    tenantId,
    replyStatus === "sent"
      ? {
          lastOutboundAt: new Date().toISOString(),
          lastOutboundTo: phoneNormalized,
          lastOutboundStatus: "sent",
          lastOutboundMode: credentials?.mode ?? null,
          lastFailureAt: null,
          lastFailureMessage: null,
        }
      : {
          lastOutboundAt: new Date().toISOString(),
          lastOutboundTo: phoneNormalized,
          lastOutboundStatus: "failed",
          lastOutboundMode: credentials?.mode ?? null,
          lastFailureAt: new Date().toISOString(),
          lastFailureMessage: replyError,
        },
  );

  await db.insert(outbox).values({
    tenantId,
    type: "whatsapp.message_received",
    payload: {
      contactId: contact.id,
      leadId,
      tenantId,
      from: phoneNormalized,
      messageId,
      text: text ?? bodyPreview,
      messageType,
      workflowKind: workflowPlan.kind,
      whatsappIntent,
      workflowState,
      taskId,
      replied: replyStatus === "sent",
    },
  });

  await db
    .update(contacts)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contact.id)));

  logger.info(
    {
      tenantId,
      contactId: contact.id,
      leadId,
      replied: replyStatus === "sent",
      workflowKind: workflowPlan.kind,
      whatsappIntent,
      taskId,
    },
    "[wa-inbound] processed",
  );
}

export const whatsappInboundWorker = new Worker<WhatsappInboundJob>(
  WHATSAPP_INBOUND_QUEUE_NAME,
  async (job) => {
    try {
      await processWhatsappInbound(job);
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      logger.error({ err: String(err), jobId: job.id }, "[wa-inbound] job failed");
      throw err;
    }
  },
  {
    connection,
    concurrency: 10,
  },
);

whatsappInboundWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[wa-inbound] job completed");
});

whatsappInboundWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, "[wa-inbound] job failed permanently");
});
