import {
  EchoProvider,
  ProviderRouter,
  SMS_AUTOMATION_QUEUE_NAME,
  createAnthropicHaiku,
  createAnthropicSonnet,
  createOpenAIMini,
  getPrompt,
  smsAutomationJobSchema,
  type SmsAutomationJob,
  type ToolDefinition,
  type UsageRecord,
} from "@marketing/ai-router";
import { aiUsage, db, smsAutomationJobs, tenants } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { Worker, type Job } from "bullmq";
import { connection } from "./queue";

const CREATE_SMS_AUTOMATION_TOOL: ToolDefinition = {
  name: "create_sms_automation",
  description: "Return a reviewable SMS sequence.",
  inputSchema: {
    type: "object",
    required: ["name", "category", "trigger_event", "trigger_filter", "steps"],
    properties: {
      name: { type: "string", maxLength: 120 },
      category: { type: "string", maxLength: 80 },
      trigger_event: { type: "string" },
      trigger_filter: { type: "object" },
      steps: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          required: ["delay_minutes", "template_name", "body", "purpose"],
          properties: {
            delay_minutes: { type: "integer", minimum: 0 },
            template_name: { type: "string", maxLength: 120 },
            body: { type: "string", maxLength: 320 },
            purpose: { type: "string", enum: ["transactional", "marketing"] },
          },
        },
      },
    },
  },
};

function buildRouter(): ProviderRouter {
  if (env.AI_PROVIDER_FALLBACK === "echo") {
    const echo = new EchoProvider();
    return new ProviderRouter({ trial: echo, primary: echo, fallback: echo });
  }
  if (env.ANTHROPIC_API_KEY) {
    const haiku = createAnthropicHaiku();
    const sonnet = createAnthropicSonnet();
    return new ProviderRouter({
      trial: haiku,
      primary: sonnet,
      fallback: env.OPENAI_API_KEY ? createOpenAIMini() : haiku,
    });
  }
  if (env.OPENAI_API_KEY) {
    const mini = createOpenAIMini();
    return new ProviderRouter({ trial: mini, primary: mini, fallback: mini });
  }
  const echo = new EchoProvider();
  return new ProviderRouter({ trial: echo, primary: echo, fallback: echo });
}

let providerRouter: ProviderRouter | null = null;

async function writeUsage(record: UsageRecord): Promise<void> {
  await db
    .insert(aiUsage)
    .values({
      tenantId: record.tenantId,
      jobId: record.jobId,
      provider: record.provider,
      model: record.model,
      promptId: record.promptId,
      promptVersion: record.promptVersion,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      costUsd: record.costUsd.toFixed(6),
    })
    .onConflictDoNothing({ target: aiUsage.jobId });
}

function fallback(_job: SmsAutomationJob) {
  return {
    name: "Restaurant reservation SMS follow-up",
    category: "restaurant_reservation",
    trigger_event: "reservation.status_changed",
    trigger_filter: { leadKind: "booking", workflowState: "confirmed" },
    steps: [
      {
        delay_minutes: 0,
        template_name: "Reservation confirmed",
        purpose: "transactional",
        body: `Hello {{first_name}}, your table at {{business_name}} is confirmed for {{reservation_date}} at {{reservation_time}} for {{party_size}} people.`,
      },
      {
        delay_minutes: 1440,
        template_name: "Visit reminder",
        purpose: "transactional",
        body: `Reminder from {{business_name}}: we look forward to welcoming you for your reservation. Reply if your plans change.`,
      },
    ],
  };
}

async function processJob(rawJob: Job<SmsAutomationJob>): Promise<void> {
  const job = smsAutomationJobSchema.parse(rawJob.data);
  const [existing] = await db
    .select({ status: smsAutomationJobs.status })
    .from(smsAutomationJobs)
    .where(and(eq(smsAutomationJobs.tenantId, job.tenantId), eq(smsAutomationJobs.id, job.jobId)));
  if (existing?.status === "completed") return;

  await db
    .update(smsAutomationJobs)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(smsAutomationJobs.tenantId, job.tenantId), eq(smsAutomationJobs.id, job.jobId)));

  try {
    const [tenant] = await db
      .select({ plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, job.tenantId));
    const prompt = getPrompt("sms-automation-complete-v1");
    let result: unknown;
    try {
      providerRouter ??= buildRouter();
      const output = await providerRouter.routeWithTools(
        {
          prompt: prompt.buildUserPrompt({
            businessName: job.businessName,
            vertical: job.vertical,
            city: job.city ?? "",
            locale: job.locale,
            intent: job.intent,
            purpose: job.purpose,
          }),
          systemPrompt: prompt.systemPrompt,
          maxTokens: 2200,
          temperature: 0.55,
        },
        [CREATE_SMS_AUTOMATION_TOOL],
        {
          tenantId: job.tenantId,
          jobId: job.jobId,
          promptId: job.promptId,
          promptVersion: job.promptVersion,
          costBudgetCents: job.costBudgetCents,
        },
        { tenantPlan: tenant?.plan ?? "trial", writeUsage },
      );
      result = output.toolResult ?? fallback(job);
    } catch (error) {
      logger.warn({ jobId: job.jobId, error: String(error) }, "[sms-ai] using fallback");
      result = fallback(job);
    }

    await db
      .update(smsAutomationJobs)
      .set({ status: "completed", result, completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(smsAutomationJobs.tenantId, job.tenantId), eq(smsAutomationJobs.id, job.jobId)),
      );
  } catch (error) {
    await db
      .update(smsAutomationJobs)
      .set({
        status: "failed",
        errorMessage: String(error),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(smsAutomationJobs.tenantId, job.tenantId), eq(smsAutomationJobs.id, job.jobId)),
      );
    throw error;
  }
}

export const smsAutomationWorker = new Worker<SmsAutomationJob>(
  SMS_AUTOMATION_QUEUE_NAME,
  processJob,
  { connection, concurrency: 3 },
);
