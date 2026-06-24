import {
  SMS_AUTOMATION_QUEUE_NAME,
  SMS_SEND_QUEUE_NAME,
  SMS_SEQUENCE_TRIGGER_QUEUE_NAME,
  SMS_WEBHOOK_QUEUE_NAME,
  type SmsAutomationJob,
  type SmsSendJob,
  type SmsSequenceTriggerJob,
} from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

function createConnection() {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 8000,
  });
}

async function addJob<T>(
  queueName: string,
  name: string,
  data: T,
  options: JobsOptions,
): Promise<void> {
  const connection = createConnection();
  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  });
  try {
    await queue.add(name, data, options);
  } finally {
    await queue.close();
  }
}

export function enqueueSmsSendJob(data: SmsSendJob, options?: JobsOptions): Promise<void> {
  return addJob(SMS_SEND_QUEUE_NAME, "send", data, {
    jobId: `sms-send-${data.messageId}`,
    ...options,
  });
}

export function enqueueSmsSequenceTriggerJob(
  data: SmsSequenceTriggerJob,
  options?: JobsOptions,
): Promise<void> {
  return addJob(SMS_SEQUENCE_TRIGGER_QUEUE_NAME, "trigger", data, {
    jobId: `sms-trigger-${data.eventId}`,
    ...options,
  });
}

export function enqueueSmsWebhookJob(webhookEventId: string, options?: JobsOptions): Promise<void> {
  return addJob(
    SMS_WEBHOOK_QUEUE_NAME,
    "process",
    { webhookEventId },
    { jobId: `sms-webhook-${webhookEventId}`, ...options },
  );
}

export function enqueueSmsAutomationJob(
  data: SmsAutomationJob,
  options?: JobsOptions,
): Promise<void> {
  return addJob(SMS_AUTOMATION_QUEUE_NAME, "generate", data, {
    jobId: data.idempotencyKey,
    ...options,
  });
}
