import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const LEAD_FOLLOW_UP_QUEUE_NAME = "lead-follow-up" as const;

export type LeadFollowUpJob = {
  tenantId: string;
  leadId: string;
};

export async function enqueueLeadFollowUpJob(data: LeadFollowUpJob): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 8000,
  });
  const queue = new Queue<LeadFollowUpJob>(LEAD_FOLLOW_UP_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  try {
    await queue.add("lead-follow-up", data, {
      jobId: `lead-follow-up:${data.leadId}`,
    });
  } finally {
    await queue.close();
  }
}
