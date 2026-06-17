// Serverless note: per-call connections avoid the Vercel 504 caused by persistent sockets.
import { DOMAIN_CERT_QUEUE_NAME, type DomainCertJob } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export async function enqueueDomainCertJob(job: DomainCertJob): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const queue = new Queue<DomainCertJob>(DOMAIN_CERT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  try {
    await queue.add(`domain-cert:${job.action}`, job, {
      jobId: job.idempotencyKey,
    });
  } finally {
    await queue.close();
  }
}
