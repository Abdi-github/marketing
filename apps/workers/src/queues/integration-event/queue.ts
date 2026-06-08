import { INTEGRATION_EVENT_QUEUE_NAME } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const integrationEventQueue = new Queue(INTEGRATION_EVENT_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});
