import { DATA_ERASURE_QUEUE_NAME } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Low-priority, single-attempt — FADP erasure is idempotent by design.
export const dataErasureQueue = new Queue(DATA_ERASURE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});
