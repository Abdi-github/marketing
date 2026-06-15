import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const CONTACT_SCORE_QUEUE_NAME = "contact-score" as const;

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const contactScoreQueue = new Queue<ContactScoreJob>(CONTACT_SCORE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  },
});

export type ContactScoreJob = {
  tenantId: string;
  contactId: string;
};
