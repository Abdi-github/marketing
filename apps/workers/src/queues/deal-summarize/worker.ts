// Deal-summarize nightly worker (step-27).
// Runs once per night via BullMQ repeatable job.
// Finds open deals with no activity in 14+ days, calls Haiku via deal-summarize-v1,
// stores ai_summary + suggested next step in deals.ai_summary.
// ADR-0008: Haiku for routine summarization; Sonnet reserved for high-stakes output.
import {
  createAnthropicHaiku,
  EchoProvider,
  getPrompt,
  type CallOpts,
  type ToolDefinition,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import { dealActivities, dealStages, deals } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { Worker } from "bullmq";
import { and, desc, eq, lt } from "drizzle-orm";
import { connection, dealSummarizeQueue, DEAL_SUMMARIZE_QUEUE_NAME } from "./queue";
import type { DealSummarizeJob } from "./queue";

// ─── Tool definition ──────────────────────────────────────────────────────────

const SUMMARIZE_TOOL: ToolDefinition = {
  name: "summarize_deal",
  description: "Output the deal summary and suggested next step",
  inputSchema: {
    type: "object",
    required: ["summary", "next_step"],
    properties: {
      summary: {
        type: "string",
        maxLength: 120,
        description: "Brief summary of the deal situation",
      },
      next_step: {
        type: "string",
        maxLength: 120,
        description: "Concrete recommended next action for the sales person",
      },
    },
  },
};

// ─── Provider ─────────────────────────────────────────────────────────────────

function buildProvider() {
  if (env.AI_PROVIDER_FALLBACK === "echo" || !env.ANTHROPIC_API_KEY) {
    return new EchoProvider();
  }
  return createAnthropicHaiku();
}

// ─── Worker logic ─────────────────────────────────────────────────────────────

const STALE_DAYS = 14;

async function processDealSummarize(): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Find open deals with no activity in 14+ days.
  const staleDealRows = await db
    .select({
      id: deals.id,
      tenantId: deals.tenantId,
      title: deals.title,
      amountChf: deals.amountChf,
      stageId: deals.stageId,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(and(eq(deals.status, "open"), lt(deals.updatedAt, staleThreshold)))
    .limit(100); // process up to 100 per run to avoid runaway AI costs

  if (staleDealRows.length === 0) {
    logger.info("[deal-summarize] no stale deals found");
    return;
  }

  logger.info({ count: staleDealRows.length }, "[deal-summarize] processing stale deals");

  const provider = buildProvider();
  const promptDef = getPrompt("deal-summarize-v1");

  for (const deal of staleDealRows) {
    try {
      // Load stage label.
      const [stageRow] = await db
        .select({ label: dealStages.label })
        .from(dealStages)
        .where(eq(dealStages.id, deal.stageId));

      const stageLabel = stageRow?.label ?? "Unknown";

      // Load recent activities (last 5, newest first).
      const activities = await db
        .select({
          type: dealActivities.type,
          content: dealActivities.content,
          createdAt: dealActivities.createdAt,
        })
        .from(dealActivities)
        .where(eq(dealActivities.dealId, deal.id))
        .orderBy(desc(dealActivities.createdAt))
        .limit(5);

      const daysSinceActivity = Math.round(
        (Date.now() - deal.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
      );

      const recentActivitiesText =
        activities.length > 0
          ? activities.map((a) => `[${a.type}] ${a.content}`).join("\n")
          : "No recent activities";

      const callOpts: CallOpts = {
        tenantId: deal.tenantId,
        jobId: `deal-summarize-${deal.id}`,
        promptId: promptDef.id,
        promptVersion: promptDef.version,
        costBudgetCents: 5, // Haiku is cheap — 5¢ hard cap per deal
      };

      const userPrompt = promptDef.buildUserPrompt({
        title: deal.title,
        amountChf: String(deal.amountChf),
        stageLabel,
        daysSinceActivity: String(daysSinceActivity),
        recentActivities: recentActivitiesText,
        locale: "en",
      });

      const result = await provider.completionWithTools(
        {
          prompt: userPrompt,
          systemPrompt: promptDef.systemPrompt,
          maxTokens: 256,
          temperature: 0.3,
        },
        [SUMMARIZE_TOOL],
        callOpts,
      );

      const toolResult = result.toolResult as { summary?: string; next_step?: string } | null;
      if (!toolResult) {
        logger.warn({ dealId: deal.id }, "[deal-summarize] no tool result, skipping");
        continue;
      }

      const aiSummary = [
        toolResult.summary ?? "",
        toolResult.next_step ? `Next: ${toolResult.next_step}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      await db.update(deals).set({ aiSummary, updatedAt: new Date() }).where(eq(deals.id, deal.id));

      logger.info({ dealId: deal.id, aiSummary }, "[deal-summarize] updated");
    } catch (err) {
      logger.error({ dealId: deal.id, err }, "[deal-summarize] failed for deal, continuing");
    }
  }
}

// ─── Worker registration ──────────────────────────────────────────────────────

const worker = new Worker<DealSummarizeJob>(
  DEAL_SUMMARIZE_QUEUE_NAME,
  async () => {
    await processDealSummarize();
  },
  {
    connection,
    concurrency: 1,
  },
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "[deal-summarize] job failed");
});

// Schedule nightly at 02:00 UTC.
dealSummarizeQueue.add(
  "nightly",
  {},
  {
    repeat: { pattern: "0 2 * * *" },
    jobId: "deal-summarize-nightly",
  },
);

logger.info("[deal-summarize] worker started, nightly cron at 02:00 UTC");
