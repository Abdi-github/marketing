// tRPC router for email templates + sequences + enrollments (step-26).
// Templates: CRUD + AI draft (Sonnet).
// Sequences: CRUD + manual enroll/unenroll + AI suggest (Haiku).
// Actual sending is handled by the email-sequence-tick BullMQ worker.
// ADR-0023: platform-level Resend send; sandbox mode when RESEND_API_KEY unset.
import {
  createAnthropicHaiku,
  createAnthropicSonnet,
  EchoProvider,
  getPrompt,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  contacts,
  emailSendingDomains,
  emailSequenceEnrollments,
  emailSequences,
  emailSends,
  emailTemplates,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";
import type { CallOpts, ToolDefinition } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { businessProfiles } from "@marketing/db";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const sequenceStepSchema = z.object({
  delay_minutes: z.number().int().min(0),
  template_id: z.string().uuid(),
});

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

// ─── AI tool definitions ──────────────────────────────────────────────────────

const CREATE_EMAIL_TEMPLATE_TOOL: ToolDefinition = {
  name: "create_email_template",
  description: "Return a drafted email template with subject, HTML body, and plain-text body",
  inputSchema: {
    type: "object",
    required: ["subject", "body_html", "body_text"],
    properties: {
      subject: { type: "string", maxLength: 120 },
      body_html: { type: "string" },
      body_text: { type: "string" },
    },
  },
};

const SUGGEST_SEQUENCE_TOOL: ToolDefinition = {
  name: "suggest_email_sequence",
  description: "Propose a 3-step email sequence",
  inputSchema: {
    type: "object",
    required: ["name", "steps"],
    properties: {
      name: { type: "string", maxLength: 80 },
      steps: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          required: ["delay_minutes", "suggested_subject"],
          properties: {
            delay_minutes: { type: "integer", minimum: 0 },
            suggested_subject: { type: "string", maxLength: 120 },
          },
        },
      },
    },
  },
};

function buildSonnet() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) return new EchoProvider();
  return createAnthropicSonnet();
}

function buildHaiku() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) return new EchoProvider();
  return createAnthropicHaiku();
}

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

  // AI-draft a template; returns the draft without saving — user edits and calls createTemplate.
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

      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
          addressCity: businessProfiles.addressCity,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const prompt = getPrompt("email-template-v1");
      const provider = buildSonnet();

      if (!provider.completionWithTools) {
        // EchoProvider fallback: return a placeholder draft.
        return {
          subject: `[Draft] ${input.purpose.slice(0, 50)}`,
          bodyHtml: `<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><p>Hallo {{first_name}},</p><p>${input.purpose}</p><p>Mit freundlichen Grüssen,<br>{{business_name}}</p></body></html>`,
          bodyText: `Hallo {{first_name}},\n\n${input.purpose}\n\nMit freundlichen Grüssen,\n{{business_name}}`,
        };
      }

      const callOpts: CallOpts = {
        tenantId,
        jobId: crypto.randomUUID(),
        promptId: "email-template-v1",
        promptVersion: 1,
        costBudgetCents: 30,
      };

      const result = await provider.completionWithTools(
        {
          prompt: prompt.buildUserPrompt({
            businessName: profile?.businessName ?? "our business",
            vertical: profile?.vertical ?? "SME",
            city: profile?.addressCity ?? "",
            locale: input.locale,
            purpose: input.purpose,
            tone: input.tone ?? "warm and professional",
          }),
          systemPrompt: prompt.systemPrompt,
          maxTokens: 3000,
          temperature: 0.7,
        },
        [CREATE_EMAIL_TEMPLATE_TOOL],
        callOpts,
      );

      if (!result.toolResult) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI did not return a template draft.",
        });
      }

      const raw = result.toolResult as { subject?: string; body_html?: string; body_text?: string };
      return {
        subject: raw.subject ?? "",
        bodyHtml: raw.body_html ?? "",
        bodyText: raw.body_text ?? "",
        aiDraftedAt: new Date().toISOString(),
      };
    }),

  // ─── Sequences ───────────────────────────────────────────────────────────────

  listSequences: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const rows = await db
      .select({
        id: emailSequences.id,
        name: emailSequences.name,
        triggerEvent: emailSequences.triggerEvent,
        status: emailSequences.status,
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
        triggerFilter: z.record(z.string(), z.unknown()).default({}),
        steps: z.array(sequenceStepSchema).max(10).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await assertTemplatesBelongToTenant(tenantId, input.steps);

      const [created] = await db
        .insert(emailSequences)
        .values({
          tenantId,
          name: input.name,
          triggerEvent: input.triggerEvent,
          triggerFilter: input.triggerFilter,
          steps: input.steps,
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
        triggerFilter: z.record(z.string(), z.unknown()).optional(),
        steps: z.array(sequenceStepSchema).max(10).optional(),
        status: z.enum(["active", "paused"]).optional(),
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

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.triggerEvent !== undefined) patch.triggerEvent = input.triggerEvent;
      if (input.triggerFilter !== undefined) patch.triggerFilter = input.triggerFilter;
      if (input.steps !== undefined) patch.steps = input.steps;
      if (input.status !== undefined) patch.status = input.status;
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

  // AI-suggest a 3-step sequence scaffold (no templates created — user adds them).
  aiSuggestSequence: tenantProcedure
    .input(
      z.object({
        triggerEvent: triggerEventEnum,
        context: z.string().max(300).optional(),
        locale: z.string().default("de-CH"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
          addressCity: businessProfiles.addressCity,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const prompt = getPrompt("email-sequence-suggest-v1");
      const provider = buildHaiku();

      if (!provider.completionWithTools) {
        return {
          name: `${input.triggerEvent} Sequenz`,
          steps: [
            { delay_minutes: 0, suggested_subject: "Willkommen!" },
            { delay_minutes: 4320, suggested_subject: "Nachfassen nach 3 Tagen" },
            { delay_minutes: 10080, suggested_subject: "Letzte Erinnerung" },
          ],
        };
      }

      const callOpts: CallOpts = {
        tenantId,
        jobId: crypto.randomUUID(),
        promptId: "email-sequence-suggest-v1",
        promptVersion: 1,
        costBudgetCents: 10,
      };

      const result = await provider.completionWithTools(
        {
          prompt: prompt.buildUserPrompt({
            businessName: profile?.businessName ?? "our business",
            vertical: profile?.vertical ?? "SME",
            city: profile?.addressCity ?? "",
            locale: input.locale,
            triggerEvent: input.triggerEvent,
            context: input.context ?? "",
          }),
          systemPrompt: prompt.systemPrompt,
          maxTokens: 512,
        },
        [SUGGEST_SEQUENCE_TOOL],
        callOpts,
      );

      if (!result.toolResult) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI did not return a sequence suggestion.",
        });
      }

      return result.toolResult as {
        name: string;
        steps: Array<{ delay_minutes: number; suggested_subject: string }>;
      };
    }),
});
