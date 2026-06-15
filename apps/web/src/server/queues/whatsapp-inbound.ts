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
  text: string;
  timestamp: number;
};

let _connection: IORedis | null = null;
let _queue: Queue<WhatsappInboundJob> | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _connection;
}

export function getWhatsappInboundQueue(): Queue<WhatsappInboundJob> {
  if (!_queue) {
    _queue = new Queue<WhatsappInboundJob>(WHATSAPP_INBOUND_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _queue;
}
