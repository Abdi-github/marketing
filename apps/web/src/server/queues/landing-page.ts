// FlowProducer for the landing-page job graph (web producer side).
// The FlowProducer creates the 4-step BullMQ tree atomically in Redis.
// Consumer side: apps/workers/src/queues/landing-page/worker.ts
// Design: ADR-0012 (FlowProducer, linear chain, bottom-up execution).
import { LANDING_PAGE_QUEUE_NAME, type LandingPageJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { FlowProducer, Queue } from "bullmq";
import IORedis from "ioredis";

let _connection: IORedis | null = null;
let _flow: FlowProducer | null = null;
let _queue: Queue<LandingPageJob> | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _connection;
}

export function getLandingPageFlow(): FlowProducer {
  if (!_flow) {
    _flow = new FlowProducer({ connection: getConnection() });
  }
  return _flow;
}

export function getLandingPageQueue(): Queue<LandingPageJob> {
  if (!_queue) {
    _queue = new Queue<LandingPageJob>(LANDING_PAGE_QUEUE_NAME, {
      connection: getConnection(),
    });
  }
  return _queue;
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
    idempotencyKey: `${base.landingPageId}:${step}`,
    promptId,
    promptVersion: 1,
  });

  const briefPrompt = BRIEF_PROMPT[locale] ?? "landing-page-brief-v1";
  const layoutPrompt = LAYOUT_PROMPT[locale] ?? "landing-page-layout-v1";
  // If template provided, use the template-fill prompt; otherwise standard copy.
  const copyPrompt = base.templateKey
    ? (TEMPLATE_FILL_PROMPT[locale] ?? "landing-page-template-fill-v1")
    : (COPY_PROMPT[locale] ?? "landing-page-copy-v1");

  await getLandingPageFlow().add({
    name: "compose:publish",
    queueName: q,
    data: make("publish", layoutPrompt),
    opts: jobOpts,
    children: [
      {
        name: "compose:layout",
        queueName: q,
        data: make("layout", layoutPrompt),
        opts: jobOpts,
        children: [
          {
            name: "compose:copy",
            queueName: q,
            data: make("copy", copyPrompt),
            opts: jobOpts,
            children: [
              {
                name: "compose:brief",
                queueName: q,
                data: make("brief", briefPrompt),
                opts: jobOpts,
              },
            ],
          },
        ],
      },
    ],
  });
}

export async function enqueueLandingPageLocalization(base: BaseJobData): Promise<void> {
  const job: LandingPageJob = {
    ...base,
    step: "localize",
    idempotencyKey: `${base.landingPageId}:localize:${Date.now()}`,
    promptId: "landing-page-localize-v1",
    promptVersion: 1,
    forceLocalization: true,
  };

  await getLandingPageQueue().add("compose:localize", job, {
    jobId: job.idempotencyKey,
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  });
}
