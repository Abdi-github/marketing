import { EMAIL_AUTOMATION_QUEUE_NAME, type EmailAutomationJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { type JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 100 },
};

export async function enqueueEmailAutomationJob(
  data: EmailAutomationJob,
  opts?: JobsOptions,
): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 8000,
  });
  const queue = new Queue<EmailAutomationJob>(EMAIL_AUTOMATION_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  try {
    await queue.add(`email-automation:${data.kind}`, data, {
      jobId: data.idempotencyKey,
      ...opts,
    });
  } finally {
    await queue.close();
  }
}
