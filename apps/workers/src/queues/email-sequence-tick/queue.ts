import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const EMAIL_SEQUENCE_TICK_QUEUE_NAME = "email-sequence-tick" as const;

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Tick job has no payload — it's a periodic sweep of due enrollments + outbox events.
export type EmailSequenceTickJob = Record<string, never>;

export const emailSequenceTickQueue = new Queue<EmailSequenceTickJob>(
  EMAIL_SEQUENCE_TICK_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  },
);
