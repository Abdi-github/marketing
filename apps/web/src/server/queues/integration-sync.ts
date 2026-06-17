// Serverless note: per-call connections avoid the Vercel 504 caused by persistent sockets.
import { INTEGRATION_SYNC_QUEUE_NAME, type IntegrationSyncJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { type JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 3000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 100 },
};

export async function enqueueIntegrationSyncJob(
  name: string,
  data: IntegrationSyncJob,
  opts: JobsOptions,
): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const queue = new Queue<IntegrationSyncJob>(INTEGRATION_SYNC_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  try {
    await queue.add(name, data, opts);
  } finally {
    await queue.close();
  }
}
