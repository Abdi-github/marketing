import { NextResponse } from "next/server";
import { db } from "@marketing/db";
import { sql } from "drizzle-orm";
import { env } from "@marketing/shared";
import IORedis from "ioredis";

export const dynamic = "force-dynamic";

let _redis: IORedis | null = null;
function getRedis() {
  if (!_redis)
    _redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  return _redis;
}

export async function GET() {
  const [dbResult, redisResult] = await Promise.allSettled([
    (async () => {
      const t = Date.now();
      await db.execute(sql`SELECT 1`);
      return Date.now() - t;
    })(),
    (async () => {
      const t = Date.now();
      const redis = getRedis();
      await redis.connect().catch(() => {}); // lazyConnect requires explicit connect
      const pong = await redis.ping();
      if (pong !== "PONG") throw new Error("unexpected PING response");
      return Date.now() - t;
    })(),
  ]);

  const dbOk = dbResult.status === "fulfilled";
  const redisOk = redisResult.status === "fulfilled";
  const overall = dbOk && redisOk ? "ok" : "degraded";

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
      checks: {
        db: dbOk ? "ok" : "error",
        dbLatencyMs: dbOk ? dbResult.value : undefined,
        redis: redisOk ? "ok" : "error",
        redisLatencyMs: redisOk ? redisResult.value : undefined,
      },
    },
    { status: overall === "ok" ? 200 : 503 },
  );
}
