// Queue producer used by the web tRPC router to enqueue social-post jobs.
// Workers runs the consumer side (apps/workers/src/queues/social-post/worker.ts).
import { SOCIAL_POST_QUEUE_NAME } from "@marketing/ai-router";
import { env } from "@marketing/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";

let _connection: IORedis | null = null;
let _queue: Queue | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _connection;
}

export function getSocialPostQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(SOCIAL_POST_QUEUE_NAME, {
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
