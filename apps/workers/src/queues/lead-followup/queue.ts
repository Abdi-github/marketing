import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const LEAD_FOLLOW_UP_QUEUE_NAME = "lead-follow-up" as const;

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const leadFollowUpQueue = new Queue<LeadFollowUpJob>(LEAD_FOLLOW_UP_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

export type LeadFollowUpJob = {
  tenantId: string;
  leadId: string;
};
