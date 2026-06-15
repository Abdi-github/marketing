// Contact lead-scoring worker (step-25).
// Triggered by a cron job (every 5 min) that enqueues jobs for contacts
// whose events have changed since the last scoring run.
// Uses Haiku via completionWithTools — synchronous ~1s call per contact.
// Emits contact.score_changed outbox event when delta > 10.
// ADR-0022 — 18-month event retention; score computed from last 90 days only.
import {
  createAnthropicHaiku,
  EchoProvider,
  getPrompt,
  type CallOpts,
  type ToolDefinition,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import { contacts, contactScoreHistory, events, outbox } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import type { Job } from "bullmq";
import { Worker, UnrecoverableError } from "bullmq";
import { and, eq, gte, count } from "drizzle-orm";
import { connection, CONTACT_SCORE_QUEUE_NAME } from "./queue";
import type { ContactScoreJob } from "./queue";

// ─── Scoring tool definition ─────────────────────────────────────────────────

const SCORE_TOOL: ToolDefinition = {
  name: "score_contact",
  description: "Output the computed engagement score and reasoning",
  inputSchema: {
    type: "object",
    required: ["score", "reasoning"],
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100, description: "Engagement score 0-100" },
      reasoning: { type: "string", maxLength: 150, description: "One-sentence explanation" },
    },
  },
};

// ─── Provider ────────────────────────────────────────────────────────────────

function buildProvider() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
    return new EchoProvider();
  }
  return createAnthropicHaiku();
}

// ─── Worker logic ─────────────────────────────────────────────────────────────

async function processContactScore(job: Job<ContactScoreJob>): Promise<void> {
  const { tenantId, contactId } = job.data;

  // 1. Load contact — bail fast if gone.
  const [contact] = await db
    .select({
      id: contacts.id,
      lifecycleStage: contacts.lifecycleStage,
      leadScore: contacts.leadScore,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

  if (!contact) {
    logger.warn({ tenantId, contactId }, "[score] contact not found, skipping");
    return;
  }

  // 2. Aggregate events from the last 90 days by type.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const eventCounts = await db
    .select({
      eventType: events.eventType,
      total: count(),
    })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.contactId, contactId),
        gte(events.occurredAt, since),
      ),
    )
    .groupBy(events.eventType);

  if (eventCounts.length === 0) {
    logger.debug({ contactId }, "[score] no events in 90d, skipping scoring run");
    return;
  }

  const eventSummary = eventCounts.map((r) => `${r.eventType}: ${r.total}`).join("\n");

  // 3. Call Haiku with the scoring prompt.
  const prompt = getPrompt("contact-score-v1");
  const provider = buildProvider();

  let newScore = contact.leadScore;
  let reasoning = "";

  if (provider.completionWithTools) {
    const callOpts: CallOpts = {
      tenantId,
      jobId: job.id ?? crypto.randomUUID(),
      promptId: "contact-score-v1",
      promptVersion: 1,
      costBudgetCents: 5,
    };

    const result = await provider.completionWithTools(
      {
        prompt: prompt.buildUserPrompt({
          lifecycleStage: contact.lifecycleStage,
          previousScore: String(contact.leadScore),
          eventSummary,
        }),
        systemPrompt: prompt.systemPrompt,
        maxTokens: 256,
      },
      [SCORE_TOOL],
      callOpts,
    );

    if (result.toolResult) {
      const raw = result.toolResult as { score?: unknown; reasoning?: unknown };
      const parsed =
        typeof raw.score === "number"
          ? Math.min(100, Math.max(0, Math.round(raw.score)))
          : contact.leadScore;
      newScore = parsed;
      reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
    }
  } else {
    // EchoProvider fallback — derive a simple heuristic score.
    const totalEvents = eventCounts.reduce((s, r) => s + Number(r.total), 0);
    newScore = Math.min(100, Math.round(totalEvents * 3));
  }

  const delta = Math.abs(newScore - contact.leadScore);

  // 4. Persist in a transaction: update contact score + append history row + maybe emit event.
  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ leadScore: newScore, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    if (delta > 0) {
      await tx.insert(contactScoreHistory).values({
        tenantId,
        contactId,
        score: newScore,
        previousScore: contact.leadScore,
        reasoning: reasoning || null,
      });
    }

    if (delta >= 10) {
      await tx.insert(outbox).values({
        tenantId,
        type: "contact.score_changed",
        payload: {
          contactId,
          tenantId,
          previousScore: contact.leadScore,
          newScore,
          delta,
          reasoning,
        },
      });
    }
  });

  logger.info(
    { contactId, tenantId, previousScore: contact.leadScore, newScore, delta },
    "[score] contact scored",
  );
}

// ─── Worker bootstrap ─────────────────────────────────────────────────────────

export const contactScoreWorker = new Worker<ContactScoreJob>(
  CONTACT_SCORE_QUEUE_NAME,
  async (job) => {
    try {
      await processContactScore(job);
    } catch (err) {
      logger.error({ err: String(err), jobId: job.id }, "[score] job failed");
      // Don't retry on missing contact — that's a permanent state.
      if (err instanceof Error && err.message.includes("not found")) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  },
  {
    connection,
    concurrency: 5,
  },
);

contactScoreWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[score] job completed");
});

contactScoreWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, "[score] job failed permanently");
});
