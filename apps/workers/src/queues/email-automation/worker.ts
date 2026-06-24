import {
  EchoProvider,
  EMAIL_AUTOMATION_QUEUE_NAME,
  ProviderRouter,
  createAnthropicHaiku,
  createAnthropicSonnet,
  createOpenAIMini,
  emailAutomationJobSchema,
  getPrompt,
  type EmailAutomationJob,
  type ToolDefinition,
  type UsageRecord,
} from "@marketing/ai-router";
import { aiUsage, db, emailAutomationJobs, tenants } from "@marketing/db";
import { env, logger } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { Worker, type Job } from "bullmq";
import { connection } from "./queue";

const CREATE_EMAIL_AUTOMATION_TOOL: ToolDefinition = {
  name: "create_email_automation",
  description: "Return a complete reviewable email automation package.",
  inputSchema: {
    type: "object",
    required: ["name", "category", "trigger_filter", "steps"],
    properties: {
      name: { type: "string", maxLength: 120 },
      category: { type: "string", maxLength: 80 },
      trigger_filter: {
        type: "object",
        properties: {
          leadKind: { type: "string" },
          requireMarketingConsent: { type: "boolean" },
        },
      },
      steps: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          required: ["delay_minutes", "template_name", "subject", "body_html", "body_text"],
          properties: {
            delay_minutes: { type: "integer", minimum: 0 },
            template_name: { type: "string", maxLength: 120 },
            subject: { type: "string", maxLength: 160 },
            body_html: { type: "string" },
            body_text: { type: "string" },
          },
        },
      },
    },
  },
};

function buildProviderRouter(): ProviderRouter {
  if (env.AI_PROVIDER_FALLBACK === "echo") {
    const echo = new EchoProvider();
    return new ProviderRouter({ trial: echo, primary: echo, fallback: echo });
  }
  if (env.ANTHROPIC_API_KEY) {
    const haiku = createAnthropicHaiku();
    const sonnet = createAnthropicSonnet();
    const fallback =
      env.AI_PROVIDER_FALLBACK === "openai" || env.OPENAI_API_KEY ? createOpenAIMini() : haiku;
    return new ProviderRouter({ trial: haiku, primary: sonnet, fallback });
  }
  if (env.OPENAI_API_KEY) {
    const mini = createOpenAIMini();
    return new ProviderRouter({ trial: mini, primary: mini, fallback: mini });
  }
  const echo = new EchoProvider();
  return new ProviderRouter({ trial: echo, primary: echo, fallback: echo });
}

let router: ProviderRouter | null = null;
function getRouter(): ProviderRouter {
  router ??= buildProviderRouter();
  return router;
}

async function getTenantPlan(tenantId: string): Promise<string> {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return tenant?.plan ?? "trial";
}

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

function fallbackAutomation(job: EmailAutomationJob) {
  const isBooking =
    job.intent === "booking" ||
    job.intent === "restaurant_reservation" ||
    /reservation|booking|table/i.test(job.purpose);
  const leadKind = isBooking ? "booking" : job.intent === "quote" ? "quote" : job.intent;
  return {
    name: isBooking ? "Reservation request follow-up" : "Lead follow-up sequence",
    category: isBooking ? "restaurant_reservation" : leadKind,
    trigger_filter: {
      leadKind,
      requireMarketingConsent: false,
    },
    steps: [
      {
        delay_minutes: 0,
        template_name: isBooking ? "Reservation request received" : "Request received",
        subject: `Thanks for contacting {{business_name}}`,
        body_html:
          "<p>Hello {{first_name}},</p><p>Thanks for your request. Our team has received it and will reply shortly.</p><p>{{business_name}}</p>",
        body_text:
          "Hello {{first_name}},\n\nThanks for your request. Our team has received it and will reply shortly.\n\n{{business_name}}",
      },
      {
        delay_minutes: 1440,
        template_name: "Friendly follow-up",
        subject: `Following up from {{business_name}}`,
        body_html:
          "<p>Hello {{first_name}},</p><p>We wanted to follow up and make sure you have everything you need from us.</p><p>{{business_name}}</p>",
        body_text:
          "Hello {{first_name}},\n\nWe wanted to follow up and make sure you have everything you need from us.\n\n{{business_name}}",
      },
    ],
  };
}

async function processJob(rawJob: Job<EmailAutomationJob>): Promise<void> {
  const job = emailAutomationJobSchema.parse(rawJob.data);
  const now = new Date();

  const [existing] = await db
    .select({ status: emailAutomationJobs.status })
    .from(emailAutomationJobs)
    .where(
      and(eq(emailAutomationJobs.tenantId, job.tenantId), eq(emailAutomationJobs.id, job.jobId)),
    );
  if (existing?.status === "completed") return;

  await db
    .update(emailAutomationJobs)
    .set({ status: "running", startedAt: now, updatedAt: now })
    .where(
      and(eq(emailAutomationJobs.tenantId, job.tenantId), eq(emailAutomationJobs.id, job.jobId)),
    );

  try {
    const prompt = getPrompt("email-automation-complete-v1");
    let result: unknown = null;

    try {
      const toolResult = await getRouter().routeWithTools(
        {
          prompt: prompt.buildUserPrompt({
            businessName: job.businessName,
            vertical: job.vertical,
            city: job.city ?? "",
            locale: job.locale,
            intent: job.intent,
            triggerEvent: job.triggerEvent,
            purpose: job.purpose,
            tone: job.tone ?? "warm and professional",
          }),
          systemPrompt: prompt.systemPrompt,
          maxTokens: 3500,
          temperature: 0.65,
        },
        [CREATE_EMAIL_AUTOMATION_TOOL],
        {
          tenantId: job.tenantId,
          jobId: job.jobId,
          promptId: job.promptId,
          promptVersion: job.promptVersion,
          costBudgetCents: job.costBudgetCents,
        },
        { tenantPlan: await getTenantPlan(job.tenantId), writeUsage },
      );
      result = toolResult.toolResult ?? fallbackAutomation(job);
    } catch (err) {
      logger.warn(
        { err: String(err), jobId: job.jobId },
        "[email-automation] AI failed; using fallback",
      );
      result = fallbackAutomation(job);
    }

    await db
      .update(emailAutomationJobs)
      .set({
        status: "completed",
        result,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(emailAutomationJobs.tenantId, job.tenantId), eq(emailAutomationJobs.id, job.jobId)),
      );
  } catch (err) {
    await db
      .update(emailAutomationJobs)
      .set({
        status: "failed",
        errorMessage: String(err),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(emailAutomationJobs.tenantId, job.tenantId), eq(emailAutomationJobs.id, job.jobId)),
      );
    throw err;
  }
}

export const emailAutomationWorker = new Worker<EmailAutomationJob>(
  EMAIL_AUTOMATION_QUEUE_NAME,
  processJob,
  { connection, concurrency: 3 },
);

emailAutomationWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "[email-automation] job completed");
});

emailAutomationWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: String(err) }, "[email-automation] job failed");
});
