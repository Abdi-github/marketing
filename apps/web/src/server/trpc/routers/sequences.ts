// tRPC router for email templates + sequences + enrollments (step-26).
// Templates: CRUD + AI draft (Sonnet).
// Sequences: CRUD + manual enroll/unenroll + AI suggest (Haiku).
// Actual sending is handled by the email-sequence-tick BullMQ worker.
// ADR-0023: platform-level Resend send; sandbox mode when RESEND_API_KEY unset.
import type { EmailAutomationIntent, EmailAutomationKind } from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  businessProfiles,
  contacts,
  emailAutomationJobs,
  emailSendingDomains,
  emailSequenceEnrollments,
  emailSequences,
  emailSends,
  emailSuppressions,
  emailTemplates,
  tenantUsers,
  users,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";
import { env } from "@marketing/shared";
import { enqueueEmailAutomationJob } from "../../queues/email-automation";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const sequenceStepSchema = z.object({
  delay_minutes: z.number().int().min(0),
  template_id: z.string().uuid(),
});

const sequenceTriggerFilterSchema = z
  .object({
    lifecycle_stage: z.string().optional(),
    min_delta: z.number().optional(),
    min_score: z.number().optional(),
    leadKind: z.enum(["booking", "callback", "quote", "generic"]).optional(),
    sourceChannel: z.string().optional(),
    formId: z.string().uuid().optional(),
    landingPageId: z.string().uuid().optional(),
    requireMarketingConsent: z.boolean().optional(),
  })
  .default({});

const triggerEventEnum = z.enum([
  "lead.captured",
  "contact.score_changed",
  "contact.lifecycle_changed",
  "manual",
]);

const DOMAIN_REGEX =
  /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function normalizeLocalPart(input: string | undefined): string {
  const local = (input ?? "hello").trim().toLowerCase();
  return /^[a-z0-9._%+-]{1,64}$/.test(local) ? local : "hello";
}

function isUsablePlatformSender(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const email = normalized.match(/<([^>]+)>/)?.[1] ?? normalized;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".localhost");
}

function buildEmailDnsInstructions(domain: string, verifyToken: string) {
  return {
    verification: {
      type: "TXT",
      name: `_marketing-email.${domain}`,
      value: `marketing-email-verify=${verifyToken}`,
    },
    spf: {
      type: "TXT",
      name: domain,
      value: "Add your email provider's SPF include to the domain's existing SPF record.",
    },
    dmarc: {
      type: "TXT",
      name: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none;",
    },
  };
}

async function checkEmailDomainToken(
  domain: string,
  verifyToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const expected = `marketing-email-verify=${verifyToken}`;
  try {
    const { resolveTxt } = await import("dns/promises");
    const records = await resolveTxt(`_marketing-email.${domain}`);
    for (const record of records) {
      if (record.join("") === expected) return { ok: true };
    }
    return { ok: false, error: "Verification TXT record not found yet." };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { ok: false, error: "No verification TXT record found yet." };
    }
    return { ok: false, error: `DNS lookup failed: ${String(err)}` };
  }
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
  const [owner] = await db
    .select({ email: users.email })
    .from(tenantUsers)
    .innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.role, "owner")));

  return owner?.email;
}

async function resolveSenderSettings(tenantId: string) {
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

  const replyTo = await resolveReplyToAddress(tenantId);
  const tenantSender = domain
    ? `${domain.fromName} <${domain.fromLocalPart}@${domain.domain}>`
    : null;
  const platformSenderConfigured = isUsablePlatformSender(env.EMAIL_FROM_ADDRESS);

  return {
    mode: tenantSender ? "tenant_domain" : "platform_sender",
    platformSender: env.EMAIL_FROM_ADDRESS,
    platformSenderConfigured,
    sender: tenantSender ?? env.EMAIL_FROM_ADDRESS,
    replyTo: replyTo ?? null,
    canSendProduction: Boolean(tenantSender || platformSenderConfigured),
    readinessMessage: tenantSender
      ? "Business sender verified."
      : platformSenderConfigured
        ? "Platform sender configured. Verify it in Resend before production delivery."
        : "Configure a real platform sender or verify a business sending domain before activating automations.",
  };
}

async function assertProductionSenderReady(tenantId: string): Promise<void> {
  const sender = await resolveSenderSettings(tenantId);
  if (!sender.canSendProduction) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: sender.readinessMessage,
    });
  }
}

type SequenceStepInput = z.infer<typeof sequenceStepSchema>;

async function assertTemplatesBelongToTenant(
  tenantId: string,
  steps: SequenceStepInput[],
): Promise<void> {
  const templateIds = [...new Set(steps.map((step) => step.template_id))];
  if (templateIds.length === 0) return;

  const rows = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.tenantId, tenantId), inArray(emailTemplates.id, templateIds)));

  if (rows.length !== templateIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more sequence steps reference a missing email template.",
    });
  }
}

type AutomationStepDraft = {
  delay_minutes: number;
  template_name: string;
  subject: string;
  body_html: string;
  body_text: string;
};

type AutomationDraftResult = {
  name: string;
  category?: string;
  trigger_filter?: Record<string, unknown>;
  steps: AutomationStepDraft[];
};

function htmlShell(body: string): string {
  const escaped = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;line-height:1.5">${escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n")}</body></html>`;
}

function restaurantReservationPreset(businessName: string): AutomationDraftResult {
  return {
    name: "Restaurant reservation follow-up",
    category: "restaurant_reservation",
    trigger_filter: { leadKind: "booking", requireMarketingConsent: false },
    steps: [
      {
        delay_minutes: 0,
        template_name: "Reservation request received",
        subject: `Your request to {{business_name}}`,
        body_text: `Hello {{first_name}},

Thanks for your reservation request for ${businessName}. We received your details and our team will confirm the booking shortly.

If anything changes, simply reply to this email.

{{business_name}}`,
        body_html: htmlShell(`Hello {{first_name}},

Thanks for your reservation request for ${businessName}. We received your details and our team will confirm the booking shortly.

If anything changes, simply reply to this email.

{{business_name}}`),
      },
      {
        delay_minutes: 1440,
        template_name: "Reservation follow-up",
        subject: `Following up from {{business_name}}`,
        body_text: `Hello {{first_name}},

We wanted to follow up on your reservation request. If you still need help or want to change the details, reply and our team will take care of it.

{{business_name}}`,
        body_html: htmlShell(`Hello {{first_name}},

We wanted to follow up on your reservation request. If you still need help or want to change the details, reply and our team will take care of it.

{{business_name}}`),
      },
      {
        delay_minutes: 4320,
        template_name: "Visit reminder",
        subject: `Before your visit to {{business_name}}`,
        body_text: `Hello {{first_name}},

We look forward to welcoming you. If you have allergies, special requests, or need to adjust your reservation, please let us know.

{{business_name}}`,
        body_html: htmlShell(`Hello {{first_name}},

We look forward to welcoming you. If you have allergies, special requests, or need to adjust your reservation, please let us know.

{{business_name}}`),
      },
      {
        delay_minutes: 10080,
        template_name: "Thank you and review request",
        subject: `Thank you from {{business_name}}`,
        body_text: `Hello {{first_name}},

Thank you for choosing us. We hope you enjoyed your experience. Your feedback helps our small team improve and helps new guests discover us.

{{business_name}}`,
        body_html: htmlShell(`Hello {{first_name}},

Thank you for choosing us. We hope you enjoyed your experience. Your feedback helps our small team improve and helps new guests discover us.

{{business_name}}`),
      },
    ],
  };
}

function parseAutomationDraft(value: unknown): AutomationDraftResult {
  const schema = z.object({
    name: z.string().min(1).max(120),
    category: z.string().max(80).optional(),
    trigger_filter: z.record(z.string(), z.unknown()).optional(),
    steps: z
      .array(
        z.object({
          delay_minutes: z.number().int().min(0),
          template_name: z.string().min(1).max(120),
          subject: z.string().min(1).max(200),
          body_html: z.string().min(1).max(50_000),
          body_text: z.string().min(1).max(20_000),
        }),
      )
      .min(1)
      .max(10),
  });
  return schema.parse(value);
}

async function createAutomationFromDraft(input: {
  tenantId: string;
  draft: AutomationDraftResult;
  presetKey: string;
  locale: string;
}) {
  const { tenantId, draft, presetKey, locale } = input;
  const category = draft.category ?? "custom";
  const sender = await resolveSenderSettings(tenantId);

  const [existing] = await db
    .select({ id: emailSequences.id })
    .from(emailSequences)
    .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.presetKey, presetKey)));
  if (existing) return { sequenceId: existing.id, reused: true };

  return await db.transaction(async (tx) => {
    const sequenceSteps: SequenceStepInput[] = [];
    for (const step of draft.steps) {
      const [template] = await tx
        .insert(emailTemplates)
        .values({
          tenantId,
          name: step.template_name,
          subject: step.subject,
          bodyHtml: step.body_html,
          bodyText: step.body_text,
          locale,
          presetKey,
          category,
          aiDraftedAt: presetKey.startsWith("ai:") ? new Date() : null,
        })
        .returning({ id: emailTemplates.id });
      sequenceSteps.push({
        delay_minutes: step.delay_minutes,
        template_id: template!.id,
      });
    }

    const [sequence] = await tx
      .insert(emailSequences)
      .values({
        tenantId,
        name: draft.name,
        triggerEvent: "lead.captured",
        triggerFilter: draft.trigger_filter ?? {},
        steps: sequenceSteps,
        status: sender.canSendProduction ? "active" : "paused",
        presetKey,
        category,
      })
      .returning({ id: emailSequences.id });

    return { sequenceId: sequence!.id, reused: false };
  });
}

// ─── AI tool definitions ──────────────────────────────────────────────────────

// ─── Router ───────────────────────────────────────────────────────────────────

export const sequencesRouter = router({
  // Email sending domains
  listSendingDomains: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const rows = await db
      .select()
      .from(emailSendingDomains)
      .where(eq(emailSendingDomains.tenantId, tenantId))
      .orderBy(desc(emailSendingDomains.createdAt));

    return rows.map((row) => ({
      ...row,
      dns: buildEmailDnsInstructions(row.domain, row.verifyToken),
    }));
  }),

  getSenderSettings: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    return resolveSenderSettings(tenantId);
  }),

  getAutomationOverview: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const [templateCount, sequenceCount, sendCount, failedCount, suppressionCount, domainCount] =
      await Promise.all([
        db
          .select({ total: count() })
          .from(emailTemplates)
          .where(eq(emailTemplates.tenantId, tenantId)),
        db
          .select({ total: count() })
          .from(emailSequences)
          .where(eq(emailSequences.tenantId, tenantId)),
        db.select({ total: count() }).from(emailSends).where(eq(emailSends.tenantId, tenantId)),
        db
          .select({ total: count() })
          .from(emailSends)
          .where(and(eq(emailSends.tenantId, tenantId), eq(emailSends.status, "failed"))),
        db
          .select({ total: count() })
          .from(emailSuppressions)
          .where(eq(emailSuppressions.tenantId, tenantId)),
        db
          .select({ total: count() })
          .from(emailSendingDomains)
          .where(
            and(
              eq(emailSendingDomains.tenantId, tenantId),
              eq(emailSendingDomains.status, "verified"),
            ),
          ),
      ]);

    const recentSends = await db
      .select({
        id: emailSends.id,
        status: emailSends.status,
        sendKind: emailSends.sendKind,
        sentAt: emailSends.sentAt,
        createdAt: emailSends.createdAt,
        subject: emailTemplates.subject,
        templateName: emailTemplates.name,
        contactEmail: contacts.email,
      })
      .from(emailSends)
      .innerJoin(
        emailTemplates,
        and(eq(emailTemplates.id, emailSends.templateId), eq(emailTemplates.tenantId, tenantId)),
      )
      .innerJoin(
        contacts,
        and(eq(contacts.id, emailSends.contactId), eq(contacts.tenantId, tenantId)),
      )
      .where(eq(emailSends.tenantId, tenantId))
      .orderBy(desc(emailSends.createdAt))
      .limit(12);

    return {
      templateCount: templateCount[0]?.total ?? 0,
      sequenceCount: sequenceCount[0]?.total ?? 0,
      sendCount: sendCount[0]?.total ?? 0,
      failedCount: failedCount[0]?.total ?? 0,
      suppressionCount: suppressionCount[0]?.total ?? 0,
      verifiedSendingDomains: domainCount[0]?.total ?? 0,
      recentSends,
    };
  }),

  createRestaurantPreset: tenantProcedure
    .input(z.object({ locale: z.string().default("en") }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [profile] = await db
        .select({ businessName: businessProfiles.businessName })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      return createAutomationFromDraft({
        tenantId,
        draft: restaurantReservationPreset(profile?.businessName ?? "our restaurant"),
        presetKey: "preset:restaurant-reservation-v1",
        locale: input.locale,
      });
    }),

  startAutomationDraft: tenantProcedure
    .input(
      z.object({
        kind: z
          .enum(["template_draft", "sequence_suggest", "complete_automation"])
          .default("complete_automation"),
        purpose: z.string().min(3).max(600),
        tone: z.string().max(120).optional(),
        locale: z.string().default("de-CH"),
        triggerEvent: triggerEventEnum.default("lead.captured"),
        intent: z
          .enum([
            "booking",
            "callback",
            "quote",
            "generic",
            "restaurant_reservation",
            "restaurant_event",
          ])
          .default("generic"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const userId = (ctx.session.user as { id?: string }).id;
      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
          addressCity: businessProfiles.addressCity,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const jobId = crypto.randomUUID();
      const idempotencyKey = `email-automation:${tenantId}:${input.kind}:${input.intent}:${Date.now()}`;
      const job = {
        tenantId,
        userId,
        jobId,
        idempotencyKey,
        kind: input.kind as EmailAutomationKind,
        locale: input.locale,
        businessName: profile?.businessName ?? "our business",
        vertical: profile?.vertical ?? "SME",
        city: profile?.addressCity ?? undefined,
        purpose: input.purpose,
        tone: input.tone,
        triggerEvent: input.triggerEvent,
        intent: input.intent as EmailAutomationIntent,
        costBudgetCents: 50,
        promptId: "email-automation-complete-v1",
        promptVersion: 1,
      };

      await db.insert(emailAutomationJobs).values({
        id: jobId,
        tenantId,
        userId: userId ?? null,
        jobKind: input.kind,
        status: "queued",
        idempotencyKey,
        input,
        costBudgetCents: 50,
      });

      await enqueueEmailAutomationJob(job);
      return { jobId, status: "queued" as const };
    }),

  getAutomationJob: tenantProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [job] = await db
        .select()
        .from(emailAutomationJobs)
        .where(
          and(eq(emailAutomationJobs.tenantId, tenantId), eq(emailAutomationJobs.id, input.jobId)),
        );
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  applyAutomationJob: tenantProcedure
    .input(z.object({ jobId: z.string().uuid(), locale: z.string().default("de-CH") }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [job] = await db
        .select({ status: emailAutomationJobs.status, result: emailAutomationJobs.result })
        .from(emailAutomationJobs)
        .where(
          and(eq(emailAutomationJobs.tenantId, tenantId), eq(emailAutomationJobs.id, input.jobId)),
        );
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "completed" || !job.result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The AI automation draft is not ready yet.",
        });
      }

      return createAutomationFromDraft({
        tenantId,
        draft: parseAutomationDraft(job.result),
        presetKey: `ai:${input.jobId}`,
        locale: input.locale,
      });
    }),

  addSendingDomain: tenantProcedure
    .input(
      z.object({
        domain: z.string().min(3).max(253),
        fromName: z.string().min(1).max(120).default("MarketingAI CH"),
        fromLocalPart: z.string().min(1).max(64).default("hello"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const domain = normalizeDomain(input.domain);
      if (!DOMAIN_REGEX.test(domain)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter a valid domain without protocol or path.",
        });
      }

      const [existing] = await db
        .select({ tenantId: emailSendingDomains.tenantId })
        .from(emailSendingDomains)
        .where(eq(emailSendingDomains.domain, domain));

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            existing.tenantId === tenantId
              ? "This sending domain is already added."
              : "This sending domain is already claimed by another account.",
        });
      }

      const verifyToken = crypto.randomUUID();
      const [created] = await db
        .insert(emailSendingDomains)
        .values({
          tenantId,
          domain,
          verifyToken,
          fromName: input.fromName.trim(),
          fromLocalPart: normalizeLocalPart(input.fromLocalPart),
        })
        .returning({
          id: emailSendingDomains.id,
          domain: emailSendingDomains.domain,
          verifyToken: emailSendingDomains.verifyToken,
        });

      return {
        ...created!,
        dns: buildEmailDnsInstructions(created!.domain, created!.verifyToken),
      };
    }),

  verifySendingDomain: tenantProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [domain] = await db
        .select()
        .from(emailSendingDomains)
        .where(
          and(
            eq(emailSendingDomains.tenantId, tenantId),
            eq(emailSendingDomains.id, input.domainId),
          ),
        );

      if (!domain) throw new TRPCError({ code: "NOT_FOUND" });

      if (domain.status === "verified") {
        return {
          status: domain.status,
          ok: true,
          dns: buildEmailDnsInstructions(domain.domain, domain.verifyToken),
        };
      }

      const checked = await checkEmailDomainToken(domain.domain, domain.verifyToken);
      const now = new Date();

      if (!checked.ok) {
        await db
          .update(emailSendingDomains)
          .set({
            status: "pending_verification",
            lastDnsCheckAt: now,
            lastDnsCheckError: checked.error ?? "Verification failed.",
            updatedAt: now,
          })
          .where(
            and(
              eq(emailSendingDomains.tenantId, tenantId),
              eq(emailSendingDomains.id, input.domainId),
            ),
          );

        return {
          status: "pending_verification",
          ok: false,
          error: checked.error ?? "Verification TXT record not found yet.",
          dns: buildEmailDnsInstructions(domain.domain, domain.verifyToken),
        };
      }

      await db.transaction(async (tx) => {
        const [primary] = await tx
          .select({ id: emailSendingDomains.id })
          .from(emailSendingDomains)
          .where(
            and(
              eq(emailSendingDomains.tenantId, tenantId),
              eq(emailSendingDomains.status, "verified"),
              eq(emailSendingDomains.isPrimary, true),
            ),
          );

        await tx
          .update(emailSendingDomains)
          .set({
            status: "verified",
            isPrimary: !primary,
            verifiedAt: now,
            lastDnsCheckAt: now,
            lastDnsCheckError: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(emailSendingDomains.tenantId, tenantId),
              eq(emailSendingDomains.id, input.domainId),
            ),
          );
      });

      return {
        status: "verified",
        ok: true,
        dns: buildEmailDnsInstructions(domain.domain, domain.verifyToken),
      };
    }),

  setPrimarySendingDomain: tenantProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [domain] = await db
        .select({ id: emailSendingDomains.id, status: emailSendingDomains.status })
        .from(emailSendingDomains)
        .where(
          and(
            eq(emailSendingDomains.tenantId, tenantId),
            eq(emailSendingDomains.id, input.domainId),
          ),
        );

      if (!domain) throw new TRPCError({ code: "NOT_FOUND" });
      if (domain.status !== "verified") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Verify this sending domain before making it primary.",
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(emailSendingDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(emailSendingDomains.tenantId, tenantId));

        await tx
          .update(emailSendingDomains)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(
            and(
              eq(emailSendingDomains.tenantId, tenantId),
              eq(emailSendingDomains.id, input.domainId),
            ),
          );
      });
    }),

  removeSendingDomain: tenantProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await db
        .delete(emailSendingDomains)
        .where(
          and(
            eq(emailSendingDomains.tenantId, tenantId),
            eq(emailSendingDomains.id, input.domainId),
          ),
        );
    }),
  // ─── Templates ───────────────────────────────────────────────────────────────

  listTemplates: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    return db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        locale: emailTemplates.locale,
        aiDraftedAt: emailTemplates.aiDraftedAt,
        createdAt: emailTemplates.createdAt,
      })
      .from(emailTemplates)
      .where(eq(emailTemplates.tenantId, tenantId))
      .orderBy(desc(emailTemplates.createdAt));
  }),

  getTemplate: tenantProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [row] = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.id, input.templateId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  createTemplate: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        subject: z.string().min(1).max(200),
        bodyHtml: z.string().max(50_000),
        bodyText: z.string().max(20_000),
        locale: z.string().default("de-CH"),
        category: z.string().max(80).optional(),
        aiDraftedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [created] = await db
        .insert(emailTemplates)
        .values({
          tenantId,
          name: input.name,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyText: input.bodyText,
          locale: input.locale,
          category: input.category ?? "custom",
          aiDraftedAt: input.aiDraftedAt ? new Date(input.aiDraftedAt) : null,
        })
        .returning({ id: emailTemplates.id });
      return created!;
    }),

  updateTemplate: tenantProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        subject: z.string().min(1).max(200).optional(),
        bodyHtml: z.string().max(50_000).optional(),
        bodyText: z.string().max(20_000).optional(),
        locale: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.subject !== undefined) patch.subject = input.subject;
      if (input.bodyHtml !== undefined) patch.bodyHtml = input.bodyHtml;
      if (input.bodyText !== undefined) patch.bodyText = input.bodyText;
      if (input.locale !== undefined) patch.locale = input.locale;
      await db
        .update(emailTemplates)
        .set(patch)
        .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.id, input.templateId)));
    }),

  // Send a test of this template to a single arbitrary email address. Uses
  // sample variable values so the user can see how the merge tags render.
  // Returns { sent: true } in sandbox mode (no RESEND_API_KEY) without
  // actually transmitting — UI shows a confirmation either way.
  sendTestTemplate: tenantProcedure
    .input(
      z.object({
        templateId: z.string().uuid(),
        toEmail: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await assertProductionSenderReady(tenantId);

      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.id, input.templateId)));
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      const [profile] = await db
        .select({ businessName: businessProfiles.businessName })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const { interpolate, sendViaResend } = await import("@marketing/integrations");
      const vars = {
        first_name: "Anna",
        last_name: "Beispiel",
        email: input.toEmail,
        business_name: profile?.businessName ?? "Dein Unternehmen",
      };
      const subject = `[TEST] ${interpolate(template.subject, vars)}`;
      const html = interpolate(template.bodyHtml, vars);
      const text = interpolate(template.bodyText, vars);

      if (!env.RESEND_API_KEY) {
        // Sandbox: no key configured — confirm without sending.
        return { sent: false, sandbox: true } as const;
      }

      await sendViaResend({
        apiKey: env.RESEND_API_KEY,
        from: await resolveSenderAddress(tenantId),
        replyTo: await resolveReplyToAddress(tenantId),
        to: input.toEmail,
        subject,
        html,
        text,
        tags: [
          { name: "kind", value: "template_test" },
          { name: "template_id", value: template.id },
        ],
      });

      return { sent: true, sandbox: false } as const;
    }),

  deleteTemplate: tenantProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      // Guard: can't delete if referenced by an email_send row.
      const [usage] = await db
        .select({ total: count() })
        .from(emailSends)
        .where(and(eq(emailSends.tenantId, tenantId), eq(emailSends.templateId, input.templateId)));
      if ((usage?.total ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Template has already been used to send emails and cannot be deleted.",
        });
      }

      const sequences = await db
        .select({ id: emailSequences.id, name: emailSequences.name, steps: emailSequences.steps })
        .from(emailSequences)
        .where(eq(emailSequences.tenantId, tenantId));
      const usedBySequence = sequences.find((seq) =>
        ((seq.steps ?? []) as SequenceStepInput[]).some(
          (step) => step.template_id === input.templateId,
        ),
      );
      if (usedBySequence) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Template is used by sequence "${usedBySequence.name}" and cannot be deleted.`,
        });
      }

      await db
        .delete(emailTemplates)
        .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.id, input.templateId)));
    }),

  // Queue an AI template draft. The UI polls getAutomationJob and applies the draft after review.
  aiDraftTemplate: tenantProcedure
    .input(
      z.object({
        purpose: z.string().min(5).max(400),
        tone: z.string().max(80).optional(),
        locale: z.string().default("de-CH"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const userId = (ctx.session.user as { id?: string }).id;
      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
          addressCity: businessProfiles.addressCity,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const jobId = crypto.randomUUID();
      const idempotencyKey = `email-template:${tenantId}:${jobId}`;
      const job = {
        tenantId,
        userId,
        jobId,
        idempotencyKey,
        kind: "template_draft" as EmailAutomationKind,
        locale: input.locale,
        businessName: profile?.businessName ?? "our business",
        vertical: profile?.vertical ?? "SME",
        city: profile?.addressCity ?? undefined,
        purpose: input.purpose,
        tone: input.tone,
        triggerEvent: "manual" as const,
        intent: "generic" as EmailAutomationIntent,
        costBudgetCents: 30,
        promptId: "email-automation-complete-v1",
        promptVersion: 1,
      };

      await db.insert(emailAutomationJobs).values({
        id: jobId,
        tenantId,
        userId: userId ?? null,
        jobKind: "template_draft",
        status: "queued",
        idempotencyKey,
        input,
        costBudgetCents: 30,
      });

      await enqueueEmailAutomationJob(job);
      return { jobId, status: "queued" as const };
    }),
  listSequences: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const rows = await db
      .select({
        id: emailSequences.id,
        name: emailSequences.name,
        triggerEvent: emailSequences.triggerEvent,
        triggerFilter: emailSequences.triggerFilter,
        status: emailSequences.status,
        category: emailSequences.category,
        presetKey: emailSequences.presetKey,
        steps: emailSequences.steps,
        createdAt: emailSequences.createdAt,
      })
      .from(emailSequences)
      .where(eq(emailSequences.tenantId, tenantId))
      .orderBy(desc(emailSequences.createdAt));

    // Attach enrollment count per sequence.
    const withCounts = await Promise.all(
      rows.map(async (seq) => {
        const [cnt] = await db
          .select({ total: count() })
          .from(emailSequenceEnrollments)
          .where(
            and(
              eq(emailSequenceEnrollments.tenantId, tenantId),
              eq(emailSequenceEnrollments.sequenceId, seq.id),
              sql`${emailSequenceEnrollments.status} IN ('enrolled', 'paused')`,
            ),
          );
        return { ...seq, activeEnrollments: cnt?.total ?? 0 };
      }),
    );

    return withCounts;
  }),

  getSequence: tenantProcedure
    .input(z.object({ sequenceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [seq] = await db
        .select()
        .from(emailSequences)
        .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, input.sequenceId)));
      if (!seq) throw new TRPCError({ code: "NOT_FOUND" });
      return seq;
    }),

  createSequence: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        triggerEvent: triggerEventEnum.default("manual"),
        triggerFilter: sequenceTriggerFilterSchema,
        steps: z.array(sequenceStepSchema).max(10).default([]),
        category: z.string().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await assertTemplatesBelongToTenant(tenantId, input.steps);
      const sender = await resolveSenderSettings(tenantId);

      const [created] = await db
        .insert(emailSequences)
        .values({
          tenantId,
          name: input.name,
          triggerEvent: input.triggerEvent,
          triggerFilter: input.triggerFilter,
          steps: input.steps,
          status: sender.canSendProduction ? "active" : "paused",
          category: input.category ?? "custom",
        })
        .returning({ id: emailSequences.id });
      return created!;
    }),

  updateSequence: tenantProcedure
    .input(
      z.object({
        sequenceId: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        triggerEvent: triggerEventEnum.optional(),
        triggerFilter: sequenceTriggerFilterSchema.optional(),
        steps: z.array(sequenceStepSchema).max(10).optional(),
        status: z.enum(["active", "paused"]).optional(),
        category: z.string().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [existing] = await db
        .select({ id: emailSequences.id })
        .from(emailSequences)
        .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, input.sequenceId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.steps !== undefined) await assertTemplatesBelongToTenant(tenantId, input.steps);
      if (input.status === "active") await assertProductionSenderReady(tenantId);

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.triggerEvent !== undefined) patch.triggerEvent = input.triggerEvent;
      if (input.triggerFilter !== undefined) patch.triggerFilter = input.triggerFilter;
      if (input.steps !== undefined) patch.steps = input.steps;
      if (input.status !== undefined) patch.status = input.status;
      if (input.category !== undefined) patch.category = input.category;
      await db
        .update(emailSequences)
        .set(patch)
        .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, input.sequenceId)));
    }),

  deleteSequence: tenantProcedure
    .input(z.object({ sequenceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [active] = await db
        .select({ total: count() })
        .from(emailSequenceEnrollments)
        .where(
          and(
            eq(emailSequenceEnrollments.tenantId, tenantId),
            eq(emailSequenceEnrollments.sequenceId, input.sequenceId),
            sql`${emailSequenceEnrollments.status} IN ('enrolled', 'paused')`,
          ),
        );
      if ((active?.total ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Sequence has active enrollments. Pause and exit them before deleting.",
        });
      }
      await db
        .delete(emailSequences)
        .where(and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, input.sequenceId)));
    }),

  searchContacts: tenantProcedure
    .input(z.object({ query: z.string().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const q = `%${input.query.trim().toLowerCase()}%`;
      return db
        .select({
          id: contacts.id,
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
          lifecycleStage: contacts.lifecycleStage,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            sql`(
              lower(${contacts.email}) LIKE ${q}
              OR lower(coalesce(${contacts.firstName}, '')) LIKE ${q}
              OR lower(coalesce(${contacts.lastName}, '')) LIKE ${q}
              OR coalesce(${contacts.phone}, '') LIKE ${q}
            )`,
          ),
        )
        .orderBy(desc(contacts.lastSeenAt))
        .limit(12);
    }),

  // Manually enroll a contact into a sequence (idempotent — no error if already enrolled).
  enrollContact: tenantProcedure
    .input(z.object({ sequenceId: z.string().uuid(), contactId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [[sequence], [contact]] = await Promise.all([
        db
          .select({ id: emailSequences.id })
          .from(emailSequences)
          .where(
            and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, input.sequenceId)),
          ),
        db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId))),
      ]);

      if (!sequence || !contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence or contact was not found for this tenant.",
        });
      }

      await db
        .insert(emailSequenceEnrollments)
        .values({
          tenantId,
          sequenceId: input.sequenceId,
          contactId: input.contactId,
          nextRunAt: new Date(),
        })
        .onConflictDoNothing();
    }),

  // Exit (unenroll) a contact from a sequence.
  unenrollContact: tenantProcedure
    .input(z.object({ sequenceId: z.string().uuid(), contactId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await db
        .update(emailSequenceEnrollments)
        .set({ status: "exited", updatedAt: new Date() })
        .where(
          and(
            eq(emailSequenceEnrollments.tenantId, tenantId),
            eq(emailSequenceEnrollments.sequenceId, input.sequenceId),
            eq(emailSequenceEnrollments.contactId, input.contactId),
          ),
        );
    }),

  // List enrollments for a sequence (for the detail page).
  listEnrollments: tenantProcedure
    .input(
      z.object({
        sequenceId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: emailSequenceEnrollments.id,
            contactId: emailSequenceEnrollments.contactId,
            currentStep: emailSequenceEnrollments.currentStep,
            status: emailSequenceEnrollments.status,
            enrolledAt: emailSequenceEnrollments.enrolledAt,
            nextRunAt: emailSequenceEnrollments.nextRunAt,
            contactEmail: contacts.email,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
          })
          .from(emailSequenceEnrollments)
          .innerJoin(
            contacts,
            and(
              eq(contacts.id, emailSequenceEnrollments.contactId),
              eq(contacts.tenantId, tenantId),
            ),
          )
          .where(
            and(
              eq(emailSequenceEnrollments.tenantId, tenantId),
              eq(emailSequenceEnrollments.sequenceId, input.sequenceId),
            ),
          )
          .orderBy(desc(emailSequenceEnrollments.enrolledAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(emailSequenceEnrollments)
          .where(
            and(
              eq(emailSequenceEnrollments.tenantId, tenantId),
              eq(emailSequenceEnrollments.sequenceId, input.sequenceId),
            ),
          ),
      ]);

      return { rows, total: totalRows[0]?.total ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  // Queue an AI sequence suggestion. The UI polls getAutomationJob and applies the draft after review.
  aiSuggestSequence: tenantProcedure
    .input(
      z.object({
        triggerEvent: triggerEventEnum,
        context: z.string().max(300).optional(),
        locale: z.string().default("de-CH"),
        intent: z.enum(["booking", "callback", "quote", "generic"]).default("generic"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const userId = (ctx.session.user as { id?: string }).id;
      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
          addressCity: businessProfiles.addressCity,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const jobId = crypto.randomUUID();
      const idempotencyKey = `email-sequence:${tenantId}:${jobId}`;
      const job = {
        tenantId,
        userId,
        jobId,
        idempotencyKey,
        kind: "sequence_suggest" as EmailAutomationKind,
        locale: input.locale,
        businessName: profile?.businessName ?? "our business",
        vertical: profile?.vertical ?? "SME",
        city: profile?.addressCity ?? undefined,
        purpose: input.context || `Create a ${input.intent} follow-up sequence`,
        triggerEvent: input.triggerEvent,
        intent: input.intent as EmailAutomationIntent,
        costBudgetCents: 30,
        promptId: "email-automation-complete-v1",
        promptVersion: 1,
      };

      await db.insert(emailAutomationJobs).values({
        id: jobId,
        tenantId,
        userId: userId ?? null,
        jobKind: "sequence_suggest",
        status: "queued",
        idempotencyKey,
        input,
        costBudgetCents: 30,
      });

      await enqueueEmailAutomationJob(job);
      return { jobId, status: "queued" as const };
    }),
});
