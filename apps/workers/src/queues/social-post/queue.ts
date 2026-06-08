import { SOCIAL_POST_QUEUE_NAME } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Producer-side queue — used both by apps/web and apps/workers.
// In workers this is used for re-queuing; in web it's the entry point.
export const socialPostQueue = new Queue(SOCIAL_POST_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});
