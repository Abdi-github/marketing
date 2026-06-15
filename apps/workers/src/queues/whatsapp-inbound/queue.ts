import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const WHATSAPP_INBOUND_QUEUE_NAME = "whatsapp-inbound" as const;

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const whatsappInboundQueue = new Queue<WhatsappInboundJob>(WHATSAPP_INBOUND_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

export type WhatsappInboundJob = {
  tenantId: string;
  phoneNumberId: string;
  messageId: string;
  from: string;
  text: string;
  timestamp: number;
};
