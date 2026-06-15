import { DOMAIN_CERT_QUEUE_NAME, type DomainCertJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;
let queue: Queue<DomainCertJob> | null = null;

function getConnection(): IORedis {
  connection ??= new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}

export function getDomainCertQueue(): Queue<DomainCertJob> {
  queue ??= new Queue<DomainCertJob>(DOMAIN_CERT_QUEUE_NAME, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
}

export async function enqueueDomainCertJob(job: DomainCertJob): Promise<void> {
  await getDomainCertQueue().add(`domain-cert:${job.action}`, job, {
    jobId: job.idempotencyKey,
  });
}
