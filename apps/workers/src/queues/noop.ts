import { env, logger } from "@marketing/shared";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const noopQueue = new Queue("noop", { connection });

export const noopWorker = new Worker(
  "noop",
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, "[noop] processing job");
  },
  { connection },
);

noopWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "[noop] job completed");
});

noopWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[noop] job failed");
});
