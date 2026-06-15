// tRPC router for contact segments (step-28).
// Segments are saved AND/OR rule trees evaluated at query-time against contacts.
// Rule evaluator: buildWhereClause() translates SegmentRule → Drizzle condition.
// Bulk actions: add tag, change lifecycle, enroll in sequence, export CSV.
// NL→rule: Sonnet + completionWithTools → build_segment_rule tool.
// ADR-0001: all queries carry tenantId guard.
import {
  createAnthropicSonnet,
  getPrompt,
  type CallOpts,
  type ToolDefinition,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import {
  contacts,
  emailSequenceEnrollments,
  emailSequences,
  outbox,
  segments,
} from "@marketing/db";
import type { ContactLifecycleStage, SegmentGroupRule, SegmentLeafRule } from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, ilike, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure, router } from "../trpc";
import { env } from "@marketing/shared";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const segmentLeafSchema = z.object({
  field: z.enum(["lifecycle_stage", "lead_score", "tags", "source", "email"]),
  op: z.enum(["eq", "neq", "gte", "lte", "contains", "not_contains"]),
  value: z.string().max(200),
});

const segmentRuleSchema = z.object({
  op: z.enum(["and", "or"]),
  children: z.array(segmentLeafSchema).min(0).max(20),
});

// ─── Rule evaluator ───────────────────────────────────────────────────────────
// Translates a SegmentGroupRule (flat AND/OR of leaf conditions) into a Drizzle
// SQL condition array. Caller wraps with and(tenantId, ...) or or(...).

type DrizzleCondition = ReturnType<typeof eq> | ReturnType<typeof gte> | ReturnType<typeof sql>;

function buildLeafCondition(leaf: SegmentLeafRule): DrizzleCondition | undefined {
  const { field, op, value } = leaf;

  switch (field) {
    case "lifecycle_stage": {
      const stage = value as ContactLifecycleStage;
      if (op === "eq") return eq(contacts.lifecycleStage, stage);
      if (op === "neq") return ne(contacts.lifecycleStage, stage);
      break;
    }
    case "lead_score": {
      const num = parseInt(value, 10);
      if (isNaN(num)) return undefined;
      if (op === "gte") return gte(contacts.leadScore, num);
      if (op === "lte") return lte(contacts.leadScore, num);
      if (op === "eq") return eq(contacts.leadScore, num);
      break;
    }
    case "tags": {
      if (op === "contains") return sql`${contacts.tags} @> ARRAY[${value}]::text[]`;
      if (op === "not_contains") return sql`NOT (${contacts.tags} @> ARRAY[${value}]::text[])`;
      break;
    }
    case "source": {
      if (op === "eq") return eq(contacts.source, value);
      if (op === "neq") return ne(contacts.source, value);
      if (op === "contains") return ilike(contacts.source, `%${value}%`);
      break;
    }
    case "email": {
      if (op === "contains") return ilike(contacts.email, `%${value}%`);
      break;
    }
  }
  return undefined;
}

function buildRuleConditions(rule: SegmentGroupRule): DrizzleCondition[] {
  return rule.children
    .map(buildLeafCondition)
    .filter((c): c is DrizzleCondition => c !== undefined);
}

function buildRuleWhere(rule: SegmentGroupRule, tenantId: string) {
  const leafConditions = buildRuleConditions(rule);
  const tenantCond = eq(contacts.tenantId, tenantId);
  if (leafConditions.length === 0) return tenantCond;

  if (rule.op === "and") {
    return and(tenantCond, ...leafConditions);
  }
  // or: tenant must match AND (any of the leaf conditions)
  return and(tenantCond, or(...leafConditions));
}

// ─── AI tool definition ───────────────────────────────────────────────────────

const BUILD_SEGMENT_RULE_TOOL: ToolDefinition = {
  name: "build_segment_rule",
  description: "Build a contact segment rule from the user's description",
  inputSchema: {
    type: "object",
    required: ["op", "children"],
    properties: {
      op: { type: "string", enum: ["and", "or"] },
      children: {
        type: "array",
        items: {
          type: "object",
          required: ["field", "op", "value"],
          properties: {
            field: {
              type: "string",
              enum: ["lifecycle_stage", "lead_score", "tags", "source", "email"],
            },
            op: {
              type: "string",
              enum: ["eq", "neq", "gte", "lte", "contains", "not_contains"],
            },
            value: { type: "string" },
          },
        },
      },
    },
  },
};

// ─── Echo fallback for NL→rule ────────────────────────────────────────────────

function echoSegmentRule(prompt: string): SegmentGroupRule {
  const lower = prompt.toLowerCase();
  const children: SegmentLeafRule[] = [];

  // Simple keyword heuristics for testing without AI.
  if (lower.includes("lead")) children.push({ field: "lifecycle_stage", op: "eq", value: "lead" });
  if (lower.includes("customer"))
    children.push({ field: "lifecycle_stage", op: "eq", value: "customer" });
  if (lower.includes("score") || lower.includes("high"))
    children.push({ field: "lead_score", op: "gte", value: "70" });
  if (lower.includes("cafe") || lower.includes("café"))
    children.push({ field: "tags", op: "contains", value: "cafe" });

  return {
    op: "and",
    children:
      children.length > 0 ? children : [{ field: "lifecycle_stage", op: "eq", value: "lead" }],
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const segmentsRouter = router({
  // List all segments for the tenant (with live contact count).
  list: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const rows = await db
      .select()
      .from(segments)
      .where(eq(segments.tenantId, tenantId))
      .orderBy(segments.createdAt);

    // Compute contact count for each segment.
    const withCounts = await Promise.all(
      rows.map(async (seg) => {
        const rule = seg.ruleJson as SegmentGroupRule;
        const [agg] = await db
          .select({ total: count() })
          .from(contacts)
          .where(buildRuleWhere(rule, tenantId));
        return { ...seg, contactCount: agg?.total ?? 0 };
      }),
    );

    return withCounts;
  }),

  // Get a single segment.
  get: tenantProcedure
    .input(z.object({ segmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [seg] = await db
        .select()
        .from(segments)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId)));
      if (!seg) throw new TRPCError({ code: "NOT_FOUND" });
      return seg;
    }),

  // Create a new segment.
  create: tenantProcedure
    .input(z.object({ name: z.string().min(1).max(200), ruleJson: segmentRuleSchema }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [created] = await db
        .insert(segments)
        .values({ tenantId, name: input.name, ruleJson: input.ruleJson })
        .returning({ id: segments.id });
      return created!;
    }),

  // Update segment name and/or rule.
  update: tenantProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        ruleJson: segmentRuleSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.ruleJson !== undefined) patch.ruleJson = input.ruleJson;
      await db
        .update(segments)
        .set(patch)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId)));
    }),

  // Delete a segment.
  delete: tenantProcedure
    .input(z.object({ segmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      await db
        .delete(segments)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId)));
    }),

  // Live contact count preview — used while building rules in the UI.
  previewCount: tenantProcedure
    .input(z.object({ ruleJson: segmentRuleSchema }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const rule = input.ruleJson as SegmentGroupRule;
      const [agg] = await db
        .select({ total: count() })
        .from(contacts)
        .where(buildRuleWhere(rule, tenantId));
      return { count: agg?.total ?? 0 };
    }),

  // NL→rule: describe a segment in natural language → get rule_json.
  fromNaturalLanguage: tenantProcedure
    .input(z.object({ prompt: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
        return { ruleJson: echoSegmentRule(input.prompt) };
      }

      const provider = createAnthropicSonnet();
      const promptDef = getPrompt("segment-from-nl-v1");

      const callOpts: CallOpts = {
        tenantId,
        jobId: `segment-nl-${Date.now()}`,
        promptId: promptDef.id,
        promptVersion: promptDef.version,
        costBudgetCents: 10,
      };

      const result = await provider.completionWithTools(
        {
          prompt: promptDef.buildUserPrompt({ prompt: input.prompt }),
          systemPrompt: promptDef.systemPrompt,
          maxTokens: 512,
          temperature: 0.2,
        },
        [BUILD_SEGMENT_RULE_TOOL],
        callOpts,
      );

      const raw = result.toolResult as { op?: string; children?: unknown[] } | null;
      if (!raw)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned no rule." });

      // Validate the AI output against our schema.
      const parsed = segmentRuleSchema.safeParse(raw);
      if (!parsed.success)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI returned invalid rule structure.",
        });

      return { ruleJson: parsed.data };
    }),

  // ─── Bulk actions ─────────────────────────────────────────────────────────

  // Add a tag to all contacts matching this segment (max 500).
  bulkAddTag: tenantProcedure
    .input(z.object({ segmentId: z.string().uuid(), tag: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [seg] = await db
        .select()
        .from(segments)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId)));
      if (!seg) throw new TRPCError({ code: "NOT_FOUND" });

      const rule = seg.ruleJson as SegmentGroupRule;
      const matched = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(buildRuleWhere(rule, tenantId))
        .limit(500);

      for (const { id } of matched) {
        await db
          .update(contacts)
          .set({ tags: sql`array_append(${contacts.tags}, ${input.tag})`, updatedAt: new Date() })
          .where(
            and(eq(contacts.id, id), sql`NOT (${contacts.tags} @> ARRAY[${input.tag}]::text[])`),
          );
      }

      return { updated: matched.length };
    }),

  // Change lifecycle stage for all contacts matching this segment (max 500).
  bulkChangeLifecycle: tenantProcedure
    .input(
      z.object({
        segmentId: z.string().uuid(),
        lifecycleStage: z.enum(["subscriber", "lead", "mql", "sql", "customer", "evangelist"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [seg] = await db
        .select()
        .from(segments)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId)));
      if (!seg) throw new TRPCError({ code: "NOT_FOUND" });

      const rule = seg.ruleJson as SegmentGroupRule;
      const matched = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(buildRuleWhere(rule, tenantId))
        .limit(500);

      if (matched.length === 0) return { updated: 0 };

      const ids = matched.map((r) => r.id);
      await db
        .update(contacts)
        .set({ lifecycleStage: input.lifecycleStage, updatedAt: new Date() })
        .where(
          and(
            eq(contacts.tenantId, tenantId),
            sql`${contacts.id} = ANY(ARRAY[${sql.raw(ids.map((id) => `'${id}'`).join(","))}]::uuid[])`,
          ),
        );

      // Emit lifecycle changed events for the sequence tick worker.
      await db.insert(outbox).values(
        ids.map((contactId) => ({
          tenantId,
          type: "contact.lifecycle_changed",
          payload: { contactId, tenantId, newStage: input.lifecycleStage },
        })),
      );

      return { updated: ids.length };
    }),

  // Enroll all matching contacts into a sequence (idempotent, max 500).
  bulkEnrollSequence: tenantProcedure
    .input(z.object({ segmentId: z.string().uuid(), sequenceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      // Verify segment and sequence both belong to tenant.
      const [[seg], [seq]] = await Promise.all([
        db
          .select({ id: segments.id, ruleJson: segments.ruleJson })
          .from(segments)
          .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId))),
        db
          .select({ id: emailSequences.id, status: emailSequences.status })
          .from(emailSequences)
          .where(
            and(eq(emailSequences.tenantId, tenantId), eq(emailSequences.id, input.sequenceId)),
          ),
      ]);

      if (!seg) throw new TRPCError({ code: "NOT_FOUND", message: "Segment not found." });
      if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "Sequence not found." });
      if (seq.status !== "active")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sequence is not active." });

      const rule = seg.ruleJson as SegmentGroupRule;
      const matched = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(buildRuleWhere(rule, tenantId))
        .limit(500);

      if (matched.length === 0) return { enrolled: 0 };

      // Idempotent bulk enroll: onConflictDoNothing skips already-enrolled contacts.
      const now = new Date();
      await db
        .insert(emailSequenceEnrollments)
        .values(
          matched.map(({ id: contactId }) => ({
            tenantId,
            sequenceId: input.sequenceId,
            contactId,
            currentStep: 0,
            status: "enrolled" as const,
            enrolledAt: now,
            nextRunAt: now,
          })),
        )
        .onConflictDoNothing();

      return { enrolled: matched.length };
    }),

  // Export matching contacts as a CSV string (max 500 rows).
  bulkExportCsv: tenantProcedure
    .input(z.object({ segmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [seg] = await db
        .select()
        .from(segments)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.id, input.segmentId)));
      if (!seg) throw new TRPCError({ code: "NOT_FOUND" });

      const rule = seg.ruleJson as SegmentGroupRule;
      const rows = await db
        .select({
          email: contacts.email,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
          source: contacts.source,
          lifecycleStage: contacts.lifecycleStage,
          leadScore: contacts.leadScore,
          tags: contacts.tags,
          firstSeenAt: contacts.firstSeenAt,
        })
        .from(contacts)
        .where(buildRuleWhere(rule, tenantId))
        .limit(500);

      const header =
        "email,first_name,last_name,phone,source,lifecycle_stage,lead_score,tags,first_seen_at";
      const lines = rows.map((r) =>
        [
          r.email,
          r.firstName ?? "",
          r.lastName ?? "",
          r.phone ?? "",
          r.source,
          r.lifecycleStage,
          r.leadScore,
          (r.tags ?? []).join("|"),
          r.firstSeenAt instanceof Date ? r.firstSeenAt.toISOString() : String(r.firstSeenAt),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );

      return { csv: [header, ...lines].join("\n"), count: rows.length };
    }),
});
