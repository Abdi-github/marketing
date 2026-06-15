import { createAnthropicHaiku, getPrompt } from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  contacts,
  leads,
  businessProfiles,
  contactScoreHistory,
  crmTasks,
  dealActivities,
  dealStages,
  events,
  deals,
  emailSequenceEnrollments,
  emailSequences,
  emailSends,
  emailSuppressions,
  emailTemplates,
  messages,
} from "@marketing/db";
import { TRPCError } from "@trpc/server";
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { requires, tenantProcedure, router } from "../trpc";

type ContactTimelineItem = {
  id: string;
  kind:
    | "lead"
    | "event"
    | "score"
    | "message"
    | "deal"
    | "deal_activity"
    | "email"
    | "sequence"
    | "task";
  title: string;
  body: string | null;
  occurredAt: Date;
  meta: Record<string, unknown>;
};

type EmailStatus = "active" | "unsubscribed" | "bounced" | "complained";

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function emailStatusFromReason(reason: string | null | undefined): EmailStatus {
  if (reason === "unsubscribed" || reason === "bounced" || reason === "complained") {
    return reason;
  }
  return "active";
}

function parseOptionalDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date." });
  }
  return parsed;
}

async function assertContactBelongsToTenant(tenantId: string, contactId: string): Promise<void> {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

  if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
}

async function assertDealBelongsToContact(
  tenantId: string,
  dealId: string | null | undefined,
  contactId: string,
): Promise<void> {
  if (!dealId) return;

  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dealId), eq(deals.contactId, contactId)));

  if (!deal) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid deal for this contact." });
  }
}

export const contactsRouter = router({
  // Paginated contact list. Supports tag, lifecycle, search and column sort.
  list: tenantProcedure
    .input(
      z.object({
        tag: z.string().optional(),
        q: z.string().trim().max(200).optional(),
        lifecycleStage: z
          .enum(["subscriber", "lead", "mql", "sql", "customer", "evangelist"])
          .optional(),
        sortBy: z.enum(["lastSeenAt", "firstSeenAt", "email", "leadScore"]).default("lastSeenAt"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const offset = (input.page - 1) * input.pageSize;

      const filters = [eq(contacts.tenantId, tenantId)];
      if (input.tag) filters.push(arrayContains(contacts.tags, [input.tag]));
      if (input.lifecycleStage) filters.push(eq(contacts.lifecycleStage, input.lifecycleStage));
      if (input.q) {
        const needle = `%${input.q}%`;
        const searchClause = or(
          ilike(contacts.email, needle),
          ilike(contacts.firstName, needle),
          ilike(contacts.lastName, needle),
        );
        if (searchClause) filters.push(searchClause);
      }
      const where = and(...filters);

      const sortCol =
        input.sortBy === "email"
          ? contacts.email
          : input.sortBy === "firstSeenAt"
            ? contacts.firstSeenAt
            : input.sortBy === "leadScore"
              ? contacts.leadScore
              : contacts.lastSeenAt;
      const orderClause = input.sortDir === "asc" ? asc(sortCol) : desc(sortCol);

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: contacts.id,
            email: contacts.email,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            tags: contacts.tags,
            source: contacts.source,
            lifecycleStage: contacts.lifecycleStage,
            leadScore: contacts.leadScore,
            firstSeenAt: contacts.firstSeenAt,
            lastSeenAt: contacts.lastSeenAt,
            leadCount: count(leads.id),
          })
          .from(contacts)
          .leftJoin(leads, eq(leads.contactId, contacts.id))
          .where(where)
          .groupBy(contacts.id)
          .orderBy(orderClause)
          .limit(input.pageSize)
          .offset(offset),
        db.select({ total: count() }).from(contacts).where(where),
      ]);

      const emails = rows.map((row) => normalizeEmail(row.email));
      const suppressionRows =
        emails.length > 0
          ? await db
              .select({
                email: emailSuppressions.email,
                reason: emailSuppressions.reason,
                suppressedAt: emailSuppressions.suppressedAt,
              })
              .from(emailSuppressions)
              .where(
                and(
                  eq(emailSuppressions.tenantId, tenantId),
                  inArray(emailSuppressions.email, emails),
                ),
              )
          : [];
      const suppressionsByEmail = new Map(
        suppressionRows.map((row) => [normalizeEmail(row.email), row]),
      );

      return {
        rows: rows.map((row) => {
          const suppression = suppressionsByEmail.get(normalizeEmail(row.email));
          return {
            ...row,
            emailStatus: emailStatusFromReason(suppression?.reason),
            emailSuppressedAt: suppression?.suppressedAt ?? null,
          };
        }),
        total: totalRows[0]?.total ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // Single contact with their leads history.
  get: tenantProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));

      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });

      const [suppression] = await db
        .select({
          reason: emailSuppressions.reason,
          suppressedAt: emailSuppressions.suppressedAt,
          source: emailSuppressions.source,
        })
        .from(emailSuppressions)
        .where(
          and(
            eq(emailSuppressions.tenantId, tenantId),
            eq(emailSuppressions.email, normalizeEmail(contact.email)),
          ),
        );

      const contactLeads = await db
        .select({
          id: leads.id,
          submittedAt: leads.submittedAt,
          sourceUrl: leads.sourceUrl,
          payload: leads.payload,
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.contactId, input.contactId)))
        .orderBy(desc(leads.submittedAt))
        .limit(50);

      return {
        ...contact,
        emailStatus: emailStatusFromReason(suppression?.reason),
        emailSuppressedAt: suppression?.suppressedAt ?? null,
        emailSuppressionSource: suppression?.source ?? null,
        leads: contactLeads,
      };
    }),

  // Add a tag to a contact.
  addTag: tenantProcedure
    .input(z.object({ contactId: z.string().uuid(), tag: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await db
        .update(contacts)
        .set({
          tags: sql`CASE WHEN ${contacts.tags} @> ARRAY[${input.tag}]::text[] THEN ${contacts.tags} ELSE array_append(${contacts.tags}, ${input.tag}::text) END`,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));
    }),

  // Remove a tag from a contact.
  removeTag: tenantProcedure
    .input(z.object({ contactId: z.string().uuid(), tag: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await db
        .update(contacts)
        .set({
          tags: sql`array_remove(${contacts.tags}, ${input.tag}::text)`,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));
    }),

  // Update notes for a contact.
  updateNotes: tenantProcedure
    .input(z.object({ contactId: z.string().uuid(), notes: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await db
        .update(contacts)
        .set({ notes: input.notes, updatedAt: new Date() })
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));
    }),

  listTasks: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        includeDone: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await assertContactBelongsToTenant(tenantId, input.contactId);

      return db
        .select()
        .from(crmTasks)
        .where(
          and(
            eq(crmTasks.tenantId, tenantId),
            eq(crmTasks.contactId, input.contactId),
            input.includeDone ? undefined : eq(crmTasks.status, "open"),
          ),
        )
        .orderBy(
          sql`CASE WHEN ${crmTasks.status} = 'open' THEN 0 ELSE 1 END`,
          sql`${crmTasks.dueAt} ASC NULLS LAST`,
          desc(crmTasks.createdAt),
        );
    }),

  listOpenTasks: tenantProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).default({ limit: 30 }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      return db
        .select({
          id: crmTasks.id,
          contactId: crmTasks.contactId,
          dealId: crmTasks.dealId,
          title: crmTasks.title,
          body: crmTasks.body,
          dueAt: crmTasks.dueAt,
          status: crmTasks.status,
          priority: crmTasks.priority,
          completedAt: crmTasks.completedAt,
          createdAt: crmTasks.createdAt,
          contactEmail: contacts.email,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
        })
        .from(crmTasks)
        .innerJoin(
          contacts,
          and(eq(contacts.id, crmTasks.contactId), eq(contacts.tenantId, tenantId)),
        )
        .where(and(eq(crmTasks.tenantId, tenantId), eq(crmTasks.status, "open")))
        .orderBy(sql`${crmTasks.dueAt} ASC NULLS LAST`, desc(crmTasks.createdAt))
        .limit(input.limit);
    }),

  createTask: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        dealId: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().max(1000).nullable().optional(),
        dueAt: z.string().trim().nullable().optional(),
        priority: z.enum(["low", "normal", "high"]).default("normal"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await assertContactBelongsToTenant(tenantId, input.contactId);
      await assertDealBelongsToContact(tenantId, input.dealId, input.contactId);

      const [task] = await db
        .insert(crmTasks)
        .values({
          tenantId,
          contactId: input.contactId,
          dealId: input.dealId ?? null,
          title: input.title,
          body: input.body || null,
          dueAt: parseOptionalDate(input.dueAt),
          priority: input.priority,
        })
        .returning();

      return task!;
    }),

  updateTaskStatus: tenantProcedure
    .input(z.object({ taskId: z.string().uuid(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const now = new Date();
      const [task] = await db
        .update(crmTasks)
        .set({
          status: input.done ? "done" : "open",
          completedAt: input.done ? now : null,
          updatedAt: now,
        })
        .where(and(eq(crmTasks.tenantId, tenantId), eq(crmTasks.id, input.taskId)))
        .returning();

      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      return task;
    }),

  updateTask: tenantProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        dueAt: z.string().trim().nullable().optional(),
        priority: z.enum(["low", "normal", "high"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const patch: Partial<typeof crmTasks.$inferInsert> = { updatedAt: new Date() };

      if (input.dueAt !== undefined) patch.dueAt = parseOptionalDate(input.dueAt);
      if (input.priority !== undefined) patch.priority = input.priority;

      if (input.dueAt === undefined && input.priority === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No task fields to update." });
      }

      const [task] = await db
        .update(crmTasks)
        .set(patch)
        .where(and(eq(crmTasks.tenantId, tenantId), eq(crmTasks.id, input.taskId)))
        .returning();

      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      return task;
    }),

  deleteTask: tenantProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [deleted] = await db
        .delete(crmTasks)
        .where(and(eq(crmTasks.tenantId, tenantId), eq(crmTasks.id, input.taskId)))
        .returning({ id: crmTasks.id });

      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      return deleted;
    }),

  // AI-drafted follow-up message for a contact's latest lead.
  draftFollowUp: tenantProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));

      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const latestLeads = await db
        .select({
          payload: leads.payload,
          submittedAt: leads.submittedAt,
          sourceUrl: leads.sourceUrl,
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.contactId, input.contactId)))
        .orderBy(desc(leads.submittedAt))
        .limit(1);

      const prompt = getPrompt("crm-follow-up-v1");
      const leadSummary = latestLeads[0]
        ? `Form submitted ${new Date(latestLeads[0].submittedAt).toLocaleDateString()} from ${latestLeads[0].sourceUrl ?? "landing page"}:\n${JSON.stringify(latestLeads[0].payload, null, 2)}`
        : "No form submissions yet — reached out manually.";

      const userPrompt = prompt.buildUserPrompt({
        businessName: profile?.businessName ?? "our business",
        vertical: profile?.vertical ?? "SME",
        city: profile?.addressCity ?? "",
        locale: profile?.locale ?? "en",
        contactName:
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email,
        contactEmail: contact.email,
        leadSummary,
        notes: contact.notes ?? "",
      });

      const provider = createAnthropicHaiku();
      const result = await provider.complete(
        { prompt: userPrompt, systemPrompt: prompt.systemPrompt, maxTokens: 200, temperature: 0.7 },
        {
          tenantId,
          jobId: crypto.randomUUID(),
          promptId: "crm-follow-up-v1",
          promptVersion: 1,
          costBudgetCents: 10,
        },
      );

      return { draft: result.text };
    }),

  // Update lifecycle stage and/or custom properties for a contact.
  // (Tags + notes have their own dedicated mutations above.)
  update: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        lifecycleStage: z
          .enum(["subscriber", "lead", "mql", "sql", "customer", "evangelist"])
          .optional(),
        customProperties: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.lifecycleStage !== undefined) patch.lifecycleStage = input.lifecycleStage;
      if (input.customProperties !== undefined) patch.customProperties = input.customProperties;

      await db
        .update(contacts)
        .set(patch)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));
    }),

  // Manually create a contact (not from form submission).
  create: tenantProcedure
    .input(
      z.object({
        email: z.string().email(),
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
        phone: z.string().max(30).optional(),
        notes: z.string().max(2000).optional(),
        tags: z.array(z.string().max(50)).max(20).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const email = input.email.toLowerCase().trim();

      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)));

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A contact with this email already exists.",
        });
      }

      const [created] = await db
        .insert(contacts)
        .values({
          tenantId,
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          notes: input.notes,
          tags: input.tags,
          source: "manual",
        })
        .returning({ id: contacts.id });

      return created!;
    }),

  // Export all matching contacts as CSV-ready rows. Uses the same filter/search
  // criteria as `list` but ignores pagination — capped at 10k rows to keep the
  // response sane and avoid full-tenant scrapes.
  exportCsv: tenantProcedure
    .input(
      z.object({
        tag: z.string().optional(),
        q: z.string().trim().max(200).optional(),
        lifecycleStage: z
          .enum(["subscriber", "lead", "mql", "sql", "customer", "evangelist"])
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const filters = [eq(contacts.tenantId, tenantId)];
      if (input.tag) filters.push(arrayContains(contacts.tags, [input.tag]));
      if (input.lifecycleStage) filters.push(eq(contacts.lifecycleStage, input.lifecycleStage));
      if (input.q) {
        const needle = `%${input.q}%`;
        const searchClause = or(
          ilike(contacts.email, needle),
          ilike(contacts.firstName, needle),
          ilike(contacts.lastName, needle),
        );
        if (searchClause) filters.push(searchClause);
      }

      const rows = await db
        .select({
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
          tags: contacts.tags,
          source: contacts.source,
          lifecycleStage: contacts.lifecycleStage,
          leadScore: contacts.leadScore,
          firstSeenAt: contacts.firstSeenAt,
          lastSeenAt: contacts.lastSeenAt,
          notes: contacts.notes,
        })
        .from(contacts)
        .where(and(...filters))
        .orderBy(desc(contacts.lastSeenAt))
        .limit(10000);

      return { rows };
    }),

  // Bulk delete contacts (hard delete — leads cascade via FK).
  bulkDelete: requires("admin")
    .input(z.object({ contactIds: z.array(z.string().uuid()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const result = await db
        .delete(contacts)
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, input.contactIds)))
        .returning({ id: contacts.id });
      return { deleted: result.length };
    }),

  // Bulk add a single tag to many contacts (idempotent — array_append would
  // duplicate, so we use a CASE to only append when the tag isn't already there).
  bulkAddTag: tenantProcedure
    .input(
      z.object({
        contactIds: z.array(z.string().uuid()).min(1).max(500),
        tag: z.string().min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const result = await db
        .update(contacts)
        .set({
          tags: sql`CASE WHEN ${contacts.tags} @> ARRAY[${input.tag}]::text[] THEN ${contacts.tags} ELSE array_append(${contacts.tags}, ${input.tag}::text) END`,
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, input.contactIds)))
        .returning({ id: contacts.id });
      return { updated: result.length };
    }),

  // Bulk update lifecycle stage.
  bulkUpdateStage: tenantProcedure
    .input(
      z.object({
        contactIds: z.array(z.string().uuid()).min(1).max(500),
        lifecycleStage: z.enum(["subscriber", "lead", "mql", "sql", "customer", "evangelist"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const result = await db
        .update(contacts)
        .set({ lifecycleStage: input.lifecycleStage, updatedAt: new Date() })
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, input.contactIds)))
        .returning({ id: contacts.id });
      return { updated: result.length };
    }),

  // Find likely duplicate contact pairs within the tenant. Since
  // (tenant_id, email) is uniquely indexed, exact-email duplicates can't exist —
  // we scan instead for:
  //   - same phone (non-null, normalized) → strong signal
  //   - same firstName + lastName (case-insensitive, both present) → medium
  // Returns groups of 2+ contact IDs and the matched field for the UI to display.
  findDuplicates: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;

    // 1) Phone duplicates: group by normalized phone, keep groups with ≥2 ids.
    // [:space:] is POSIX whitespace (matches space, tab, newline). Plain \s only
    // works in Postgres's AREs and not all installs enable that by default.
    const phoneRows = (await db.execute(sql`
      SELECT
        regexp_replace(phone, '[[:space:]]|[()\\-]', '', 'g') AS phone,
        array_agg(id ORDER BY first_seen_at) AS ids
      FROM contacts
      WHERE tenant_id = ${tenantId}
        AND phone IS NOT NULL
        AND length(regexp_replace(phone, '[[:space:]]|[()\\-]', '', 'g')) >= 6
      GROUP BY regexp_replace(phone, '[[:space:]]|[()\\-]', '', 'g')
      HAVING count(*) >= 2
      LIMIT 200
    `)) as unknown as Array<{ phone: string; ids: string[] }>;

    // 2) Name duplicates: same firstName + lastName (case-insensitive),
    // both present, different ids. Exclude pairs already caught by phone.
    const nameRows = (await db.execute(sql`
      SELECT
        lower(first_name) || ' ' || lower(last_name) AS display,
        array_agg(id ORDER BY first_seen_at) AS ids
      FROM contacts
      WHERE tenant_id = ${tenantId}
        AND first_name IS NOT NULL
        AND last_name IS NOT NULL
        AND length(trim(first_name)) > 0
        AND length(trim(last_name)) > 0
      GROUP BY lower(first_name), lower(last_name)
      HAVING count(*) >= 2
      LIMIT 200
    `)) as unknown as Array<{ display: string; ids: string[] }>;

    // Hydrate to full rows for display. Dedupe across both query types: a pair
    // matched by both phone AND name should only render once, with both reasons.
    const idsSet = new Set<string>();
    const allGroups: Array<{ ids: string[]; reason: "phone" | "name"; key: string }> = [];
    for (const row of phoneRows) {
      allGroups.push({ ids: row.ids, reason: "phone", key: row.phone });
      row.ids.forEach((id) => idsSet.add(id));
    }
    for (const row of nameRows) {
      // Skip if every id was already covered by a phone group.
      const allCoveredByPhone = row.ids.every((id) => idsSet.has(id));
      if (!allCoveredByPhone) {
        allGroups.push({ ids: row.ids, reason: "name", key: row.display });
        row.ids.forEach((id) => idsSet.add(id));
      }
    }

    if (idsSet.size === 0) return { groups: [] };

    const contactRows = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        phone: contacts.phone,
        leadScore: contacts.leadScore,
        firstSeenAt: contacts.firstSeenAt,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, [...idsSet])));
    const byId = new Map(contactRows.map((c) => [c.id, c]));

    return {
      groups: allGroups.map((g) => ({
        reason: g.reason,
        key: g.key,
        contacts: g.ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c),
      })),
    };
  }),

  // Merge `mergeId` into `primaryId`. Reassigns all child records, combines
  // tags/notes, then hard-deletes the duplicate. Wrapped in a transaction so
  // a partial failure leaves both contacts intact.
  merge: requires("admin")
    .input(
      z.object({
        primaryId: z.string().uuid(),
        mergeId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      if (input.primaryId === input.mergeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot merge a contact into itself.",
        });
      }

      return await db.transaction(async (tx) => {
        // Load both with tenant scope to enforce isolation.
        const both = await tx
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, tenantId),
              inArray(contacts.id, [input.primaryId, input.mergeId]),
            ),
          );
        if (both.length !== 2) {
          throw new TRPCError({ code: "NOT_FOUND", message: "One or both contacts not found." });
        }
        const primary = both.find((c) => c.id === input.primaryId)!;
        const merge = both.find((c) => c.id === input.mergeId)!;

        // Reassign FKs that allow it. email_sequence_enrollments has a UNIQUE
        // (sequence_id, contact_id) — if the primary is already enrolled in the
        // same sequence, drop the duplicate enrollment rather than colliding.
        await tx
          .delete(emailSequenceEnrollments)
          .where(
            and(
              eq(emailSequenceEnrollments.tenantId, tenantId),
              eq(emailSequenceEnrollments.contactId, merge.id),
              sql`EXISTS (SELECT 1 FROM email_sequence_enrollments p WHERE p.tenant_id = ${tenantId} AND p.sequence_id = email_sequence_enrollments.sequence_id AND p.contact_id = ${primary.id})`,
            ),
          );
        await tx
          .update(emailSequenceEnrollments)
          .set({ contactId: primary.id })
          .where(
            and(
              eq(emailSequenceEnrollments.tenantId, tenantId),
              eq(emailSequenceEnrollments.contactId, merge.id),
            ),
          );

        await tx
          .update(leads)
          .set({ contactId: primary.id })
          .where(and(eq(leads.tenantId, tenantId), eq(leads.contactId, merge.id)));

        await tx
          .update(events)
          .set({ contactId: primary.id })
          .where(and(eq(events.tenantId, tenantId), eq(events.contactId, merge.id)));

        await tx
          .update(contactScoreHistory)
          .set({ contactId: primary.id })
          .where(
            and(
              eq(contactScoreHistory.tenantId, tenantId),
              eq(contactScoreHistory.contactId, merge.id),
            ),
          );

        await tx
          .update(deals)
          .set({ contactId: primary.id })
          .where(and(eq(deals.tenantId, tenantId), eq(deals.contactId, merge.id)));

        await tx
          .update(emailSends)
          .set({ contactId: primary.id })
          .where(and(eq(emailSends.tenantId, tenantId), eq(emailSends.contactId, merge.id)));

        await tx
          .update(messages)
          .set({ contactId: primary.id })
          .where(and(eq(messages.tenantId, tenantId), eq(messages.contactId, merge.id)));

        // Combine tags as a unique union (order: primary first, then any new).
        const combinedTags = Array.from(new Set([...(primary.tags ?? []), ...(merge.tags ?? [])]));

        // Combine notes if both sides have them — primary first, then merged
        // notes prefixed so the user knows where they came from.
        const combinedNotes =
          primary.notes && merge.notes
            ? `${primary.notes}\n\n— Aus zusammengeführtem Kontakt ${merge.email}:\n${merge.notes}`
            : (primary.notes ?? merge.notes ?? null);

        // Promote fields from the merged side that the primary lacks (phone,
        // names) so we don't lose information.
        await tx
          .update(contacts)
          .set({
            firstName: primary.firstName ?? merge.firstName,
            lastName: primary.lastName ?? merge.lastName,
            phone: primary.phone ?? merge.phone,
            tags: combinedTags,
            notes: combinedNotes,
            // Keep the later "last seen" so the timeline reflects all activity.
            lastSeenAt:
              new Date(primary.lastSeenAt as Date) > new Date(merge.lastSeenAt as Date)
                ? primary.lastSeenAt
                : merge.lastSeenAt,
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, primary.id)));

        await tx
          .delete(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, merge.id)));

        return { mergedInto: primary.id };
      });
    }),

  // Score history for the sparkline (last 30 entries, newest first).
  getScoreHistory: tenantProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const rows = await db
        .select({
          score: contactScoreHistory.score,
          previousScore: contactScoreHistory.previousScore,
          reasoning: contactScoreHistory.reasoning,
          scoredAt: contactScoreHistory.scoredAt,
        })
        .from(contactScoreHistory)
        .where(
          and(
            eq(contactScoreHistory.tenantId, tenantId),
            eq(contactScoreHistory.contactId, input.contactId),
          ),
        )
        .orderBy(desc(contactScoreHistory.scoredAt))
        .limit(30);

      return rows;
    }),

  // Unified CRM timeline across form submissions, behavior, messages, deals,
  // email automation, sequences, and score changes.
  getTimeline: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(40),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, input.contactId)));

      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });

      const [
        leadRows,
        eventRows,
        scoreRows,
        messageRows,
        dealRows,
        dealActivityRows,
        emailRows,
        sequenceRows,
        taskRows,
      ] = await Promise.all([
        db
          .select({
            id: leads.id,
            submittedAt: leads.submittedAt,
            sourceUrl: leads.sourceUrl,
            payload: leads.payload,
          })
          .from(leads)
          .where(and(eq(leads.tenantId, tenantId), eq(leads.contactId, input.contactId)))
          .orderBy(desc(leads.submittedAt))
          .limit(input.limit),
        db
          .select({
            id: events.id,
            eventType: events.eventType,
            pageUrl: events.pageUrl,
            properties: events.properties,
            countryCode: events.countryCode,
            occurredAt: events.occurredAt,
          })
          .from(events)
          .where(and(eq(events.tenantId, tenantId), eq(events.contactId, input.contactId)))
          .orderBy(desc(events.occurredAt))
          .limit(input.limit),
        db
          .select({
            id: contactScoreHistory.id,
            score: contactScoreHistory.score,
            previousScore: contactScoreHistory.previousScore,
            reasoning: contactScoreHistory.reasoning,
            scoredAt: contactScoreHistory.scoredAt,
          })
          .from(contactScoreHistory)
          .where(
            and(
              eq(contactScoreHistory.tenantId, tenantId),
              eq(contactScoreHistory.contactId, input.contactId),
            ),
          )
          .orderBy(desc(contactScoreHistory.scoredAt))
          .limit(input.limit),
        db
          .select({
            id: messages.id,
            channel: messages.channel,
            direction: messages.direction,
            body: messages.body,
            status: messages.status,
            occurredAt: messages.occurredAt,
          })
          .from(messages)
          .where(and(eq(messages.tenantId, tenantId), eq(messages.contactId, input.contactId)))
          .orderBy(desc(messages.occurredAt))
          .limit(input.limit),
        db
          .select({
            id: deals.id,
            title: deals.title,
            status: deals.status,
            amountChf: deals.amountChf,
            stageLabel: dealStages.label,
            createdAt: deals.createdAt,
            updatedAt: deals.updatedAt,
          })
          .from(deals)
          .leftJoin(
            dealStages,
            and(eq(dealStages.id, deals.stageId), eq(dealStages.tenantId, tenantId)),
          )
          .where(and(eq(deals.tenantId, tenantId), eq(deals.contactId, input.contactId)))
          .orderBy(desc(deals.createdAt))
          .limit(input.limit),
        db
          .select({
            id: dealActivities.id,
            type: dealActivities.type,
            content: dealActivities.content,
            createdAt: dealActivities.createdAt,
            dealTitle: deals.title,
          })
          .from(dealActivities)
          .innerJoin(
            deals,
            and(
              eq(deals.id, dealActivities.dealId),
              eq(deals.tenantId, tenantId),
              eq(deals.contactId, input.contactId),
            ),
          )
          .where(eq(dealActivities.tenantId, tenantId))
          .orderBy(desc(dealActivities.createdAt))
          .limit(input.limit),
        db
          .select({
            id: emailSends.id,
            status: emailSends.status,
            sentAt: emailSends.sentAt,
            openedAt: emailSends.openedAt,
            clickedAt: emailSends.clickedAt,
            createdAt: emailSends.createdAt,
            templateName: emailTemplates.name,
            subject: emailTemplates.subject,
          })
          .from(emailSends)
          .leftJoin(
            emailTemplates,
            and(
              eq(emailTemplates.id, emailSends.templateId),
              eq(emailTemplates.tenantId, tenantId),
            ),
          )
          .where(and(eq(emailSends.tenantId, tenantId), eq(emailSends.contactId, input.contactId)))
          .orderBy(desc(emailSends.createdAt))
          .limit(input.limit),
        db
          .select({
            id: emailSequenceEnrollments.id,
            status: emailSequenceEnrollments.status,
            currentStep: emailSequenceEnrollments.currentStep,
            enrolledAt: emailSequenceEnrollments.enrolledAt,
            nextRunAt: emailSequenceEnrollments.nextRunAt,
            sequenceName: emailSequences.name,
          })
          .from(emailSequenceEnrollments)
          .leftJoin(
            emailSequences,
            and(
              eq(emailSequences.id, emailSequenceEnrollments.sequenceId),
              eq(emailSequences.tenantId, tenantId),
            ),
          )
          .where(
            and(
              eq(emailSequenceEnrollments.tenantId, tenantId),
              eq(emailSequenceEnrollments.contactId, input.contactId),
            ),
          )
          .orderBy(desc(emailSequenceEnrollments.enrolledAt))
          .limit(input.limit),
        db
          .select({
            id: crmTasks.id,
            title: crmTasks.title,
            body: crmTasks.body,
            dueAt: crmTasks.dueAt,
            status: crmTasks.status,
            priority: crmTasks.priority,
            completedAt: crmTasks.completedAt,
            createdAt: crmTasks.createdAt,
          })
          .from(crmTasks)
          .where(and(eq(crmTasks.tenantId, tenantId), eq(crmTasks.contactId, input.contactId)))
          .orderBy(desc(crmTasks.createdAt))
          .limit(input.limit),
      ]);

      const timeline: ContactTimelineItem[] = [
        ...leadRows.map((row) => ({
          id: `lead:${row.id}`,
          kind: "lead" as const,
          title: "Form submission",
          body: row.sourceUrl ?? null,
          occurredAt: row.submittedAt,
          meta: { payload: row.payload, sourceUrl: row.sourceUrl },
        })),
        ...eventRows.map((row) => ({
          id: `event:${row.id}`,
          kind: "event" as const,
          title: row.eventType.replaceAll("_", " "),
          body: row.pageUrl,
          occurredAt: row.occurredAt,
          meta: {
            countryCode: row.countryCode,
            pageUrl: row.pageUrl,
            properties: row.properties,
          },
        })),
        ...scoreRows.map((row) => ({
          id: `score:${row.id}`,
          kind: "score" as const,
          title: `Lead score ${row.previousScore} -> ${row.score}`,
          body: row.reasoning,
          occurredAt: row.scoredAt,
          meta: { score: row.score, previousScore: row.previousScore },
        })),
        ...messageRows.map((row) => ({
          id: `message:${row.id}`,
          kind: "message" as const,
          title: `${row.direction} ${row.channel}`,
          body: row.body,
          occurredAt: row.occurredAt,
          meta: { channel: row.channel, direction: row.direction, status: row.status },
        })),
        ...dealRows.map((row) => ({
          id: `deal:${row.id}`,
          kind: "deal" as const,
          title: `Deal: ${row.title}`,
          body: row.stageLabel ?? row.status,
          occurredAt: row.createdAt,
          meta: {
            amountChf: row.amountChf,
            status: row.status,
            stageLabel: row.stageLabel,
            updatedAt: row.updatedAt,
          },
        })),
        ...dealActivityRows.map((row) => ({
          id: `deal-activity:${row.id}`,
          kind: "deal_activity" as const,
          title: row.dealTitle ? `${row.dealTitle} - ${row.type}` : row.type,
          body: row.content,
          occurredAt: row.createdAt,
          meta: { type: row.type, dealTitle: row.dealTitle },
        })),
        ...emailRows.map((row) => {
          const occurredAt = row.clickedAt ?? row.openedAt ?? row.sentAt ?? row.createdAt;
          return {
            id: `email:${row.id}`,
            kind: "email" as const,
            title: row.subject ?? row.templateName ?? "Email",
            body: row.status,
            occurredAt,
            meta: {
              status: row.status,
              templateName: row.templateName,
              sentAt: row.sentAt,
              openedAt: row.openedAt,
              clickedAt: row.clickedAt,
            },
          };
        }),
        ...sequenceRows.map((row) => ({
          id: `sequence:${row.id}`,
          kind: "sequence" as const,
          title: row.sequenceName ?? "Email sequence",
          body: row.status,
          occurredAt: row.enrolledAt,
          meta: {
            status: row.status,
            currentStep: row.currentStep,
            nextRunAt: row.nextRunAt,
          },
        })),
        ...taskRows.map((row) => ({
          id: `task:${row.id}`,
          kind: "task" as const,
          title: row.title,
          body: row.body,
          occurredAt: row.completedAt ?? row.dueAt ?? row.createdAt,
          meta: {
            dueAt: row.dueAt,
            status: row.status,
            priority: row.priority,
            completedAt: row.completedAt,
          },
        })),
      ];

      return timeline
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, input.limit);
    }),

  // Recent behavioral events for the timeline (last 50, newest first).
  getRecentEvents: tenantProcedure
    .input(
      z.object({
        contactId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const rows = await db
        .select({
          id: events.id,
          eventType: events.eventType,
          pageUrl: events.pageUrl,
          properties: events.properties,
          countryCode: events.countryCode,
          occurredAt: events.occurredAt,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, tenantId),
            eq(events.contactId, input.contactId),
            gte(events.occurredAt, since),
          ),
        )
        .orderBy(desc(events.occurredAt))
        .limit(input.limit);

      return rows;
    }),
});
