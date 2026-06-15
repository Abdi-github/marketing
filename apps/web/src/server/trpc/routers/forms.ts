import {
  createAnthropicHaiku,
  getPrompt,
  type SmartForm,
  type ToolDefinition,
  type CallOpts,
} from "@marketing/ai-router";
import { smartFormSchema } from "@marketing/ai-router/form-schema";
import { db } from "@marketing/db";
import { contacts, events, forms, leads, type EventType, type LeadStatus } from "@marketing/db";
import { logger } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";

// ─── Shared input shapes ───────────────────────────────────────────────────────

const formUpsertInput = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  schema: z.record(z.unknown()).default({}),
  steps: smartFormSchema.shape.steps.optional(),
  settings: smartFormSchema.shape.settings.optional(),
  submitLabel: z.string().max(80).optional(),
  landingPageId: z.string().uuid().optional(),
});

const leadStatusSchema = z.enum(["new", "contacted", "qualified", "archived"]);

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function summarizePayload(payloadValue: unknown) {
  const payload = payloadRecord(payloadValue);
  const name = firstString(payload, ["name", "full_name", "first_name", "contact_name"]);
  const email = firstString(payload, ["email", "e_mail", "mail"]);
  const phone = firstString(payload, ["phone", "tel", "telephone", "mobile"]);
  const message = firstString(payload, ["message", "notes", "comment", "details", "request"]);

  return {
    name,
    email,
    phone,
    message,
    answers: Object.entries(payload)
      .filter(([key]) => !key.startsWith("__"))
      .slice(0, 12)
      .map(([key, value]) => ({
        key,
        value:
          typeof value === "string" || typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value),
      })),
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

// ─── Tool definition for AI form builder ──────────────────────────────────────

const CREATE_FORM_TOOL: ToolDefinition = {
  name: "create_form_schema",
  description: "Output the structured form schema you designed",
  inputSchema: {
    type: "object",
    required: ["steps"],
    properties: {
      steps: {
        type: "array",
        description:
          "Array of form steps (1–5). Each step has optional title and required fields array.",
        items: {
          type: "object",
          required: ["fields"],
          properties: {
            title: { type: "string" },
            fields: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "type", "label"],
                properties: {
                  name: { type: "string" },
                  type: {
                    type: "string",
                    enum: [
                      "text",
                      "email",
                      "tel",
                      "textarea",
                      "select",
                      "radio",
                      "checkbox",
                      "number",
                    ],
                  },
                  label: { type: "string" },
                  placeholder: { type: "string" },
                  required: { type: "boolean" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { label: { type: "string" }, value: { type: "string" } },
                    },
                  },
                  conditionalShowIf: {
                    type: "object",
                    properties: {
                      field: { type: "string" },
                      op: { type: "string", enum: ["eq", "neq", "contains"] },
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      submitLabel: { type: "string" },
    },
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const formsRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: forms.id,
            name: forms.name,
            slug: forms.slug,
            isActive: forms.isActive,
            landingPageId: forms.landingPageId,
            createdAt: forms.createdAt,
            leadCount: count(leads.id),
          })
          .from(forms)
          .leftJoin(leads, eq(leads.formId, forms.id))
          .where(eq(forms.tenantId, tenantId))
          .groupBy(forms.id)
          .orderBy(desc(forms.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ total: count() }).from(forms).where(eq(forms.tenantId, tenantId)),
      ]);

      return { rows, total: totalRows[0]?.total ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  get: tenantProcedure
    .input(z.object({ formId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [form] = await db
        .select()
        .from(forms)
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));

      if (!form) throw new TRPCError({ code: "NOT_FOUND" });
      return form;
    }),

  getAnalytics: tenantProcedure
    .input(
      z.object({ formId: z.string().uuid(), days: z.number().int().min(1).max(90).default(30) }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const [form] = await db
        .select({ id: forms.id, slug: forms.slug })
        .from(forms)
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));

      if (!form) throw new TRPCError({ code: "NOT_FOUND" });

      const trackedEventTypes: EventType[] = [
        "form_view",
        "form_start",
        "form_step_view",
        "form_step_complete",
        "form_abandon",
        "form_submit",
      ];

      const eventCounts = await db
        .select({
          type: events.eventType,
          total: sql<number>`COUNT(*)::int`,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.occurredAt, since),
            inArray(events.eventType, trackedEventTypes),
            sql`${events.properties}->>'form_slug' = ${form.slug}`,
          ),
        )
        .groupBy(events.eventType);

      const counts = Object.fromEntries(
        eventCounts.map((row) => [row.type, row.total ?? 0]),
      ) as Partial<Record<EventType, number>>;

      const [leadTotals] = await db
        .select({
          total: sql<number>`COUNT(*)::int`,
          recent: sql<number>`COUNT(*) FILTER (WHERE ${leads.submittedAt} >= ${since})::int`,
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.formId, input.formId)));

      const stepIndexExpr = sql<number>`COALESCE((${events.properties}->>'step_index')::int, 0)`;
      const stepTitleExpr = sql<string>`NULLIF(${events.properties}->>'step_title', '')`;
      const stepRows = await db
        .select({
          stepIndex: stepIndexExpr,
          stepTitle: stepTitleExpr,
          views: sql<number>`COUNT(*) FILTER (WHERE ${events.eventType} = 'form_step_view')::int`,
          completions: sql<number>`COUNT(*) FILTER (WHERE ${events.eventType} = 'form_step_complete')::int`,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            gte(events.occurredAt, since),
            inArray(events.eventType, ["form_step_view", "form_step_complete"]),
            sql`${events.properties}->>'form_slug' = ${form.slug}`,
          ),
        )
        .groupBy(stepIndexExpr, stepTitleExpr)
        .orderBy(stepIndexExpr);

      const views = counts.form_view ?? 0;
      const starts = counts.form_start ?? 0;
      const submits = counts.form_submit ?? 0;
      const storedLeads = leadTotals?.recent ?? 0;
      const abandons = counts.form_abandon ?? 0;
      const conversionBase = views > 0 ? views : starts;
      const conversionRate =
        conversionBase > 0 ? Math.round((submits / conversionBase) * 1000) / 10 : 0;
      const startRate = views > 0 ? Math.round((starts / views) * 1000) / 10 : 0;
      const abandonmentRate =
        starts > 0 ? Math.round(((starts - submits) / starts) * 1000) / 10 : 0;

      return {
        formId: form.id,
        formSlug: form.slug,
        periodDays: input.days,
        totals: {
          views,
          starts,
          submits,
          storedLeads,
          allTimeLeads: leadTotals?.total ?? 0,
          abandons,
          stepViews: counts.form_step_view ?? 0,
          stepCompletions: counts.form_step_complete ?? 0,
          conversionRate,
          startRate,
          abandonmentRate: Math.max(0, abandonmentRate),
        },
        funnel: [
          { label: "Viewed", count: views },
          { label: "Started", count: starts },
          { label: "Submitted", count: submits },
        ],
        steps: stepRows.map((step) => ({
          stepIndex: step.stepIndex,
          stepTitle: step.stepTitle || `Step ${step.stepIndex + 1}`,
          views: step.views ?? 0,
          completions: step.completions ?? 0,
          dropoffRate:
            step.views > 0
              ? Math.max(0, Math.round(((step.views - step.completions) / step.views) * 1000) / 10)
              : 0,
        })),
      };
    }),

  listSubmissions: tenantProcedure
    .input(
      z.object({
        formId: z.string().uuid(),
        status: leadStatusSchema.optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const offset = (input.page - 1) * input.pageSize;

      const [form] = await db
        .select({ id: forms.id, slug: forms.slug, name: forms.name })
        .from(forms)
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));
      if (!form) throw new TRPCError({ code: "NOT_FOUND" });

      const filters = [
        eq(leads.tenantId, tenantId),
        eq(leads.formId, input.formId),
        input.status ? eq(leads.status, input.status) : undefined,
      ].filter(Boolean);

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: leads.id,
            status: leads.status,
            payload: leads.payload,
            sourceUrl: leads.sourceUrl,
            submittedAt: leads.submittedAt,
            contactId: leads.contactId,
            contactEmail: contacts.email,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
            contactPhone: contacts.phone,
            contactLifecycleStage: contacts.lifecycleStage,
            contactLeadScore: contacts.leadScore,
          })
          .from(leads)
          .leftJoin(
            contacts,
            and(eq(leads.contactId, contacts.id), eq(contacts.tenantId, tenantId)),
          )
          .where(and(...filters))
          .orderBy(desc(leads.submittedAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(leads)
          .where(and(...filters)),
      ]);

      return {
        form,
        rows: rows.map((row) => ({
          ...row,
          status: row.status as LeadStatus,
          summary: summarizePayload(row.payload),
          contact: row.contactId
            ? {
                id: row.contactId,
                email: row.contactEmail,
                firstName: row.contactFirstName,
                lastName: row.contactLastName,
                phone: row.contactPhone,
                lifecycleStage: row.contactLifecycleStage,
                leadScore: row.contactLeadScore,
              }
            : null,
        })),
        total: totalRows[0]?.total ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  updateSubmissionStatus: tenantProcedure
    .input(z.object({ leadId: z.string().uuid(), status: leadStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [updated] = await db
        .update(leads)
        .set({ status: input.status })
        .where(and(eq(leads.tenantId, tenantId), eq(leads.id, input.leadId)))
        .returning({ id: leads.id, formId: leads.formId, status: leads.status });

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });

      logger.info({
        event: "forms.submission_status_updated",
        tenant_id: tenantId,
        user_id: ctx.session.user.id,
        lead_id: updated.id,
        form_id: updated.formId,
        status: input.status,
      });

      return { id: updated.id, status: updated.status as LeadStatus };
    }),

  exportSubmissions: tenantProcedure
    .input(z.object({ formId: z.string().uuid(), status: leadStatusSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [form] = await db
        .select({ id: forms.id, slug: forms.slug, name: forms.name })
        .from(forms)
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));
      if (!form) throw new TRPCError({ code: "NOT_FOUND" });

      const filters = [
        eq(leads.tenantId, tenantId),
        eq(leads.formId, input.formId),
        input.status ? eq(leads.status, input.status) : undefined,
      ].filter(Boolean);

      const rows = await db
        .select({
          id: leads.id,
          status: leads.status,
          payload: leads.payload,
          sourceUrl: leads.sourceUrl,
          submittedAt: leads.submittedAt,
          contactId: leads.contactId,
        })
        .from(leads)
        .where(and(...filters))
        .orderBy(desc(leads.submittedAt))
        .limit(5000);

      const csvRows = [
        ["submitted_at", "status", "name", "email", "phone", "source_url", "contact_id", "payload"],
        ...rows.map((row) => {
          const summary = summarizePayload(row.payload);
          return [
            row.submittedAt.toISOString(),
            row.status,
            summary.name ?? "",
            summary.email ?? "",
            summary.phone ?? "",
            row.sourceUrl ?? "",
            row.contactId ?? "",
            JSON.stringify(payloadRecord(row.payload)),
          ];
        }),
      ];

      return {
        filename: `${form.slug}-submissions.csv`,
        csv: csvRows.map((row) => row.map(csvCell).join(",")).join("\n"),
        truncated: rows.length === 5000,
      };
    }),

  create: tenantProcedure.input(formUpsertInput).mutation(async ({ ctx, input }) => {
    const { tenantId } = ctx.tenantCtx;

    const slugExists = await db
      .select({ id: forms.id })
      .from(forms)
      .where(and(eq(forms.tenantId, tenantId), eq(forms.slug, input.slug)));
    if (slugExists.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "A form with this slug already exists" });
    }

    const [created] = await db
      .insert(forms)
      .values({
        tenantId,
        name: input.name,
        slug: input.slug,
        schema: input.schema,
        steps: input.steps ?? null,
        settings: input.settings ?? { honeypot: true, turnstile_enabled: false },
        submitLabel: input.submitLabel ?? null,
        landingPageId: input.landingPageId ?? null,
      })
      .returning({ id: forms.id, slug: forms.slug });

    return created!;
  }),

  update: tenantProcedure
    .input(formUpsertInput.extend({ formId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [existing] = await db
        .select({
          id: forms.id,
          schema: forms.schema,
          steps: forms.steps,
          settings: forms.settings,
          landingPageId: forms.landingPageId,
        })
        .from(forms)
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Check slug conflict (excluding itself)
      const slugConflict = await db
        .select({ id: forms.id })
        .from(forms)
        .where(and(eq(forms.tenantId, tenantId), eq(forms.slug, input.slug)));
      if (slugConflict.length > 0 && slugConflict[0]!.id !== input.formId) {
        throw new TRPCError({ code: "CONFLICT", message: "A form with this slug already exists" });
      }

      await db
        .update(forms)
        .set({
          name: input.name,
          slug: input.slug,
          schema: Object.keys(input.schema).length > 0 ? input.schema : existing.schema,
          steps: input.steps ?? existing.steps ?? null,
          settings: input.settings ??
            existing.settings ?? { honeypot: true, turnstile_enabled: false },
          submitLabel: input.submitLabel ?? null,
          landingPageId: input.landingPageId ?? existing.landingPageId ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));

      return { success: true };
    }),

  setActive: tenantProcedure
    .input(z.object({ formId: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      await db
        .update(forms)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));

      return { success: true };
    }),

  delete: tenantProcedure
    .input(z.object({ formId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      // leads.form_id is RESTRICT — check first
      const [leadCount] = await db
        .select({ total: count() })
        .from(leads)
        .where(eq(leads.formId, input.formId));

      if ((leadCount?.total ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot delete a form that has received submissions",
        });
      }

      await db.delete(forms).where(and(eq(forms.tenantId, tenantId), eq(forms.id, input.formId)));

      return { success: true };
    }),

  // AI form builder — Haiku synchronous call (~1-2s)
  aiGenerate: tenantProcedure
    .input(
      z.object({
        description: z.string().min(10).max(800),
        locale: z.string().optional(),
        vertical: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const prompt = getPrompt("form-builder-v1");
      const haiku = createAnthropicHaiku();

      if (!haiku.completionWithTools) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI provider does not support tool use",
        });
      }

      const callOpts: CallOpts = {
        tenantId,
        jobId: crypto.randomUUID(),
        promptId: "form-builder-v1",
        promptVersion: 1,
        costBudgetCents: 20,
      };

      const result = await haiku.completionWithTools(
        {
          prompt: prompt.buildUserPrompt({
            description: input.description,
            locale: input.locale ?? "",
            vertical: input.vertical ?? "",
          }),
          systemPrompt: prompt.systemPrompt,
          maxTokens: 2048,
        },
        [CREATE_FORM_TOOL],
        callOpts,
      );

      if (!result.toolResult) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI did not return a form schema",
        });
      }

      const parsed = smartFormSchema.safeParse(result.toolResult);
      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI returned an invalid form schema",
        });
      }

      return parsed.data as SmartForm;
    }),
});
