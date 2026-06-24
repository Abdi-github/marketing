import { env } from "@marketing/shared";
import { SMS_WEBHOOK_QUEUE_NAME } from "@marketing/ai-router";
import IORedis from "ioredis";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export type SmsWebhookJob = { webhookEventId: string };
export { SMS_WEBHOOK_QUEUE_NAME };
