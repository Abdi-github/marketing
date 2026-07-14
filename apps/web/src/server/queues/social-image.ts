// Serverless note: per-call connections avoid the Vercel 504 caused by persistent sockets.
import { SOCIAL_IMAGE_QUEUE_NAME } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { type JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 100 },
};

export async function enqueueSocialImageJob(
  name: string,
  data: unknown,
  opts: JobsOptions,
): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 8000,
  });
  const queue = new Queue(SOCIAL_IMAGE_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  try {
    await queue.add(name, data, opts);
  } finally {
    await queue.close();
  }
}

export async function getSocialImageJobStatus(jobId: string): Promise<{
  state: string;
  failedReason: string | null;
  tenantId: string | null;
  postJobId: string | null;
} | null> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 8000,
  });
  const queue = new Queue(SOCIAL_IMAGE_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  try {
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const data = job.data as { tenantId?: unknown; postJobId?: unknown };
    return {
      state: await job.getState(),
      failedReason: job.failedReason || null,
      tenantId: typeof data.tenantId === "string" ? data.tenantId : null,
      postJobId: typeof data.postJobId === "string" ? data.postJobId : null,
    };
  } finally {
    await queue.close();
  }
}
