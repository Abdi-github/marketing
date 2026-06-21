// Queue producer for whatsapp-inbound jobs (web side).
// Worker runs in apps/workers/src/queues/whatsapp-inbound/worker.ts.
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const WHATSAPP_INBOUND_QUEUE_NAME = "whatsapp-inbound" as const;

export type WhatsappInboundJob = {
  tenantId: string;
  phoneNumberId: string;
  messageId: string;
  from: string;
  messageType: string;
  text: string | null;
  bodyPreview: string;
  meta: Record<string, unknown>;
  timestamp: number;
};

// Serverless note: per-call connections avoid the Vercel 504 caused by persistent sockets.
export async function enqueueWhatsappInboundJob(data: WhatsappInboundJob): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 8000,
  });
  const queue = new Queue<WhatsappInboundJob>(WHATSAPP_INBOUND_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  try {
    await queue.add("inbound", data, {
      jobId: `wa-${data.messageId}`, // deduplicate by Meta message ID
    });
  } finally {
    await queue.close();
  }
}
