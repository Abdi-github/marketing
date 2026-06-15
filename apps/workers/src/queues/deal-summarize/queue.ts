import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const DEAL_SUMMARIZE_QUEUE_NAME = "deal-summarize" as const;

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Nightly sweep — no payload, scans all stale open deals across all tenants.
export type DealSummarizeJob = Record<string, never>;

export const dealSummarizeQueue = new Queue<DealSummarizeJob>(DEAL_SUMMARIZE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 5 },
    removeOnFail: { count: 10 },
  },
});
