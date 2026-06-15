import { INTEGRATION_SYNC_QUEUE_NAME, type IntegrationSyncJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;
let queue: Queue<IntegrationSyncJob> | null = null;

function getConnection(): IORedis {
  connection ??= new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}

export function getIntegrationSyncQueue(): Queue<IntegrationSyncJob> {
  queue ??= new Queue<IntegrationSyncJob>(INTEGRATION_SYNC_QUEUE_NAME, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
}
