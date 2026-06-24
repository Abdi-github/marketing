import {
  businessProfiles,
  contacts,
  db,
  smsAutomationJobs,
  smsSequenceEnrollments,
  smsSequences,
  smsTemplates,
  tenants,
} from "@marketing/db";
import { normalizeSmsPhone } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enqueueSmsAutomationJob, enqueueSmsSequenceTriggerJob } from "../../queues/sms";
import { requires, router, tenantProcedure } from "../trpc";

const stepSchema = z.object({
  delay_minutes: z.number().int().min(0).max(525600),
  template_id: z.string().uuid(),
  purpose: z.enum(["transactional", "marketing"]),
});

const filterSchema = z.object({
  leadKind: z.enum(["booking", "callback", "quote", "generic"]).optional(),
  sourceChannel: z.string().max(80).optional(),
  formId: z.string().uuid().optional(),
  landingPageId: z.string().uuid().optional(),
  workflowState: z.string().max(80).optional(),
  requireSmsConsent: z.boolean().optional(),
});

const aiResultSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  trigger_event: z.enum(["lead.captured", "reservation.status_changed", "manual"]),
  trigger_filter: filterSchema.default({}),
  steps: z
    .array(
      z.object({
        delay_minutes: z.number().int().min(0).max(525600),
        template_name: z.string().min(1).max(120),
        body: z.string().min(1).max(320),
        purpose: z.enum(["transactional", "marketing"]),
      }),
    )
    .min(1)
    .max(4),
});

export const smsAutomationRouter = router({
  overview: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantCtx.tenantId;
    const [templates, sequences, enrollments, contactsWithPhones] = await Promise.all([
      db
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.tenantId, tenantId))
        .orderBy(desc(smsTemplates.createdAt)),
      db
        .select()
        .from(smsSequences)
        .where(eq(smsSequences.tenantId, tenantId))
        .orderBy(desc(smsSequences.createdAt)),
      db
        .select()
        .from(smsSequenceEnrollments)
        .where(eq(smsSequenceEnrollments.tenantId, tenantId))
        .orderBy(desc(smsSequenceEnrollments.enrolledAt))
        .limit(100),
      db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), isNotNull(contacts.phone)))
        .orderBy(desc(contacts.updatedAt))
        .limit(100),
    ]);
    return { templates, sequences, enrollments, contacts: contactsWithPhones };
  }),

  createTemplate: requires("editor")
    .input(
      z.object({
        name: z.string().min(1).max(120),
        body: z.string().min(1).max(320),
        locale: z.string().max(20).default("en"),
        category: z.string().max(80).default("custom"),
        isTransactional: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [template] = await db
        .insert(smsTemplates)
        .values({ tenantId: ctx.tenantCtx.tenantId, ...input })
        .returning();
      return template;
    }),

  createSequence: requires("editor")
    .input(
      z.object({
        name: z.string().min(1).max(120),
        triggerEvent: z.enum(["lead.captured", "reservation.status_changed", "manual"]),
        triggerFilter: filterSchema.default({}),
        steps: z.array(stepSchema).min(1).max(10),
        status: z.enum(["active", "paused"]).default("paused"),
        category: z.string().max(80).default("custom"),
        dailyCap: z.number().int().min(1).max(1000).default(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const templateIds = input.steps.map((step) => step.template_id);
      const owned = await db
        .select({ id: smsTemplates.id })
        .from(smsTemplates)
        .where(eq(smsTemplates.tenantId, ctx.tenantCtx.tenantId));
      const ownedIds = new Set(owned.map((row) => row.id));
      if (templateIds.some((id) => !ownedIds.has(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A sequence template is missing." });
      }
      const [sequence] = await db
        .insert(smsSequences)
        .values({ tenantId: ctx.tenantCtx.tenantId, ...input })
        .returning();
      return sequence;
    }),

  setSequenceStatus: requires("editor")
    .input(
      z.object({
        sequenceId: z.string().uuid(),
        status: z.enum(["active", "paused", "archived"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [sequence] = await db
        .update(smsSequences)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(smsSequences.tenantId, ctx.tenantCtx.tenantId),
            eq(smsSequences.id, input.sequenceId),
          ),
        )
        .returning();
      if (!sequence) throw new TRPCError({ code: "NOT_FOUND" });
      return sequence;
    }),

  setEnrollmentStatus: requires("editor")
    .input(
      z.object({
        enrollmentId: z.string().uuid(),
        status: z.enum(["enrolled", "paused", "exited"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [enrollment] = await db
        .update(smsSequenceEnrollments)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            eq(smsSequenceEnrollments.tenantId, ctx.tenantCtx.tenantId),
            eq(smsSequenceEnrollments.id, input.enrollmentId),
          ),
        )
        .returning();
      if (!enrollment) throw new TRPCError({ code: "NOT_FOUND" });
      return enrollment;
    }),

  enrollContact: requires("editor")
    .input(z.object({ sequenceId: z.string().uuid(), contactId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantCtx.tenantId;
      const [[sequence], [contact]] = await Promise.all([
        db
          .select({ id: smsSequences.id })
          .from(smsSequences)
          .where(and(eq(smsSequences.tenantId, tenantId), eq(smsSequences.id, input.sequenceId)))
          .limit(1),
        db
          .select({ id: contacts.id, phone: contacts.phone })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)))
          .limit(1),
      ]);
      if (!sequence || !contact?.phone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sequence or phone contact missing." });
      }
      normalizeSmsPhone(contact.phone);
      const eventId = randomUUID();
      await enqueueSmsSequenceTriggerJob({
        tenantId,
        eventId,
        eventType: "manual",
        sequenceId: sequence.id,
        contactId: contact.id,
        payload: {},
      });
      return { queued: true };
    }),

  installRestaurantPresets: requires("editor").mutation(async ({ ctx }) => {
    const tenantId = ctx.tenantCtx.tenantId;
    const existing = await db
      .select({ id: smsSequences.id })
      .from(smsSequences)
      .where(
        and(
          eq(smsSequences.tenantId, tenantId),
          eq(smsSequences.presetKey, "restaurant-reservation"),
        ),
      )
      .limit(1);
    if (existing[0]) return { reused: true, sequenceId: existing[0].id };

    return db.transaction(async (tx) => {
      const templates = await tx
        .insert(smsTemplates)
        .values([
          {
            tenantId,
            name: "Missing reservation details",
            body: "Hello {{first_name}}, thanks for contacting {{business_name}}. Please reply with your preferred time and number of guests.",
            category: "restaurant_reservation",
            presetKey: "restaurant-missing-details",
            isTransactional: true,
          },
          {
            tenantId,
            name: "Reservation confirmed",
            body: "Hello {{first_name}}, your table at {{business_name}} is confirmed for {{reservation_date}} at {{reservation_time}} for {{party_size}} people.",
            category: "restaurant_reservation",
            presetKey: "restaurant-confirmed",
            isTransactional: true,
          },
          {
            tenantId,
            name: "Reservation reminder",
            body: "Reminder from {{business_name}}: we look forward to welcoming you for your reservation. Reply if your plans change.",
            category: "restaurant_reservation",
            presetKey: "restaurant-reminder",
            isTransactional: true,
          },
          {
            tenantId,
            name: "Post-visit thank you",
            body: "Thanks for visiting {{business_name}}, {{first_name}}. We would love to welcome you again. Reply STOP to opt out.",
            category: "restaurant_marketing",
            presetKey: "restaurant-thank-you",
            isTransactional: false,
          },
        ])
        .returning();
      const byKey = new Map(templates.map((template) => [template.presetKey, template.id]));
      const [missingSequence, confirmedSequence] = await tx
        .insert(smsSequences)
        .values([
          {
            tenantId,
            name: "Reservation details recovery",
            triggerEvent: "lead.captured",
            triggerFilter: { leadKind: "booking", workflowState: "missing_details" },
            status: "active",
            category: "restaurant_reservation",
            presetKey: "restaurant-missing-details",
            steps: [
              {
                delay_minutes: 5,
                template_id: byKey.get("restaurant-missing-details")!,
                purpose: "transactional",
              },
            ],
          },
          {
            tenantId,
            name: "Confirmed reservation follow-up",
            triggerEvent: "reservation.status_changed",
            triggerFilter: { leadKind: "booking", workflowState: "confirmed" },
            status: "active",
            category: "restaurant_reservation",
            presetKey: "restaurant-reservation",
            steps: [
              {
                delay_minutes: 0,
                template_id: byKey.get("restaurant-confirmed")!,
                purpose: "transactional",
              },
              {
                delay_minutes: 1440,
                template_id: byKey.get("restaurant-reminder")!,
                purpose: "transactional",
              },
            ],
          },
        ])
        .returning();
      return {
        reused: false,
        sequenceId: confirmedSequence?.id,
        missingDetailsSequenceId: missingSequence?.id,
      };
    });
  }),

  startAiDraft: requires("editor")
    .input(
      z.object({
        purpose: z.string().min(3).max(600),
        intent: z.enum(["booking", "callback", "quote", "generic"]).default("booking"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantCtx.tenantId;
      const userId = (ctx.session.user as { id?: string }).id;
      const [[tenant], [profile]] = await Promise.all([
        db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
        db.select().from(businessProfiles).where(eq(businessProfiles.tenantId, tenantId)).limit(1),
      ]);
      const jobId = randomUUID();
      const idempotencyKey = `sms-automation-${tenantId}-${jobId}`;
      await db.insert(smsAutomationJobs).values({
        id: jobId,
        tenantId,
        userId,
        idempotencyKey,
        input,
      });
      await enqueueSmsAutomationJob({
        tenantId,
        userId,
        jobId,
        idempotencyKey,
        businessName: profile?.businessName ?? tenant?.name ?? "Business",
        vertical: profile?.vertical ?? "service",
        city: profile?.addressCity ?? undefined,
        locale: profile?.locale ?? "en",
        purpose: input.purpose,
        intent: input.intent,
        costBudgetCents: 30,
        promptId: "sms-automation-complete-v1",
        promptVersion: 1,
      });
      return { jobId };
    }),

  getAiDraft: tenantProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [job] = await db
        .select()
        .from(smsAutomationJobs)
        .where(
          and(
            eq(smsAutomationJobs.tenantId, ctx.tenantCtx.tenantId),
            eq(smsAutomationJobs.id, input.jobId),
          ),
        )
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  applyAiDraft: requires("editor")
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantCtx.tenantId;
      const [job] = await db
        .select()
        .from(smsAutomationJobs)
        .where(and(eq(smsAutomationJobs.tenantId, tenantId), eq(smsAutomationJobs.id, input.jobId)))
        .limit(1);
      if (!job || job.status !== "completed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI draft is not ready." });
      }
      const draft = aiResultSchema.parse(job.result);
      return db.transaction(async (tx) => {
        const templates = await tx
          .insert(smsTemplates)
          .values(
            draft.steps.map((step) => ({
              tenantId,
              name: step.template_name,
              body: step.body,
              category: draft.category,
              isTransactional: step.purpose === "transactional",
              aiDraftedAt: new Date(),
            })),
          )
          .returning();
        const [sequence] = await tx
          .insert(smsSequences)
          .values({
            tenantId,
            name: draft.name,
            triggerEvent: draft.trigger_event,
            triggerFilter: draft.trigger_filter,
            status: "paused",
            category: draft.category,
            steps: draft.steps.map((step, index) => ({
              delay_minutes: step.delay_minutes,
              template_id: templates[index]!.id,
              purpose: step.purpose,
            })),
          })
          .returning();
        return sequence;
      });
    }),
});
