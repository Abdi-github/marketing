import {
  SMS_SEQUENCE_TICK_QUEUE_NAME,
  SMS_SEQUENCE_TRIGGER_QUEUE_NAME,
  type SmsSequenceTriggerJob,
} from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const smsSequenceTriggerQueue = new Queue<SmsSequenceTriggerJob>(
  SMS_SEQUENCE_TRIGGER_QUEUE_NAME,
  { connection },
);

export const smsSequenceTickQueue = new Queue<Record<string, never>>(SMS_SEQUENCE_TICK_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
});
