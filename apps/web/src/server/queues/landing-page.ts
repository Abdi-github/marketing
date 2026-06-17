// FlowProducer for the landing-page job graph (web producer side).
// The FlowProducer creates the 4-step BullMQ tree atomically in Redis.
// Consumer side: apps/workers/src/queues/landing-page/worker.ts
// Design: ADR-0012 (FlowProducer, linear chain, bottom-up execution).
//
// Serverless note: module-level IORedis singletons keep the TCP socket open after
// the function body returns, preventing the Node.js event loop from draining.
// On Vercel this causes the function to hang until the platform kills it (504).
// Fix: create a fresh connection per operation and close it in a finally block.
import { LANDING_PAGE_QUEUE_NAME, type LandingPageJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { FlowProducer, Queue } from "bullmq";
import IORedis from "ioredis";

function createConnection(): IORedis {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

type BaseJobData = Omit<LandingPageJob, "step" | "idempotencyKey" | "promptId" | "promptVersion">;

// Template-fill prompts replace the standard copy prompt when a template is selected.
const TEMPLATE_FILL_PROMPT: Record<string, string> = {
  "it-CH": "landing-page-template-fill-it-v1",
  en: "landing-page-template-fill-en-v1",
  "fr-CH": "landing-page-template-fill-fr-v1",
};

/**
 * Enqueue the 4-step landing-page job graph atomically.
 * BullMQ executes bottom-up: brief first, then copy, layout, publish.
 */
const BRIEF_PROMPT: Record<string, string> = {
  "it-CH": "landing-page-brief-it-v1",
  en: "landing-page-brief-en-v1",
};
const COPY_PROMPT: Record<string, string> = {
  "it-CH": "landing-page-copy-it-v1",
  en: "landing-page-copy-en-v1",
};
const LAYOUT_PROMPT: Record<string, string> = {
  "it-CH": "landing-page-layout-it-v1",
  en: "landing-page-layout-en-v1",
  "fr-CH": "landing-page-layout-fr-v1",
};

export function landingPageFlowJobId(landingPageId: string, step: LandingPageJob["step"]): string {
  return `${landingPageId}--${step}`;
}

export function landingPageFlowJobIds(landingPageId: string): string[] {
  return (["brief", "copy", "layout", "publish"] as const).map((step) =>
    landingPageFlowJobId(landingPageId, step),
  );
}

export async function removeLandingPageFlowJobs(landingPageId: string): Promise<void> {
  const connection = createConnection();
  const queue = new Queue<LandingPageJob>(LANDING_PAGE_QUEUE_NAME, { connection });
  try {
    for (const jobId of landingPageFlowJobIds(landingPageId)) {
      const job = await queue.getJob(jobId);
      if (!job) continue;
      const state = await job.getState();
      if (state === "active" || state === "completed" || state === "failed") continue;
      await job.remove().catch(() => null);
    }
  } finally {
    await queue.close();
  }
}

export async function enqueueLandingPageFlow(base: BaseJobData): Promise<void> {
  const q = LANDING_PAGE_QUEUE_NAME;
  const locale = base.locale ?? "de-CH";
  const jobOpts = {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  };

  const make = (step: LandingPageJob["step"], promptId: string): LandingPageJob => ({
    ...base,
    step,
    idempotencyKey: landingPageFlowJobId(base.landingPageId, step),
    promptId,
    promptVersion: 1,
  });

  const briefPrompt = BRIEF_PROMPT[locale] ?? "landing-page-brief-v1";
  const layoutPrompt = LAYOUT_PROMPT[locale] ?? "landing-page-layout-v1";
  // If template provided, use the template-fill prompt; otherwise standard copy.
  const copyPrompt = base.templateKey
    ? (TEMPLATE_FILL_PROMPT[locale] ?? "landing-page-template-fill-v1")
    : (COPY_PROMPT[locale] ?? "landing-page-copy-v1");

  const connection = createConnection();
  const flow = new FlowProducer({ connection });
  try {
    await flow.add({
      name: "compose:publish",
      queueName: q,
      data: make("publish", layoutPrompt),
      opts: { ...jobOpts, jobId: landingPageFlowJobId(base.landingPageId, "publish") },
      children: [
        {
          name: "compose:layout",
          queueName: q,
          data: make("layout", layoutPrompt),
          opts: { ...jobOpts, jobId: landingPageFlowJobId(base.landingPageId, "layout") },
          children: [
            {
              name: "compose:copy",
              queueName: q,
              data: make("copy", copyPrompt),
              opts: { ...jobOpts, jobId: landingPageFlowJobId(base.landingPageId, "copy") },
              children: [
                {
                  name: "compose:brief",
                  queueName: q,
                  data: make("brief", briefPrompt),
                  opts: { ...jobOpts, jobId: landingPageFlowJobId(base.landingPageId, "brief") },
                },
              ],
            },
          ],
        },
      ],
    });
  } finally {
    await flow.close();
  }
}

export async function enqueueLandingPageLocalization(base: BaseJobData): Promise<void> {
  const localizationJobId = `${base.landingPageId}--localize--${Date.now()}`;
  const job: LandingPageJob = {
    ...base,
    step: "localize",
    idempotencyKey: localizationJobId,
    promptId: "landing-page-localize-v1",
    promptVersion: 1,
    forceLocalization: true,
  };

  const connection = createConnection();
  const queue = new Queue<LandingPageJob>(LANDING_PAGE_QUEUE_NAME, { connection });
  try {
    await queue.add("compose:localize", job, {
      jobId: localizationJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    });
  } finally {
    await queue.close();
  }
}
