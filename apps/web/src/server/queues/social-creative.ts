// Serverless note: per-call connections avoid the Vercel 504 caused by persistent sockets.
import { SOCIAL_CREATIVE_QUEUE_NAME } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { type JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 100 },
};

export async function enqueueSocialCreativeJob(
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
  const queue = new Queue(SOCIAL_CREATIVE_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  try {
    await queue.add(name, data, opts);
  } finally {
    await queue.close();
  }
}
