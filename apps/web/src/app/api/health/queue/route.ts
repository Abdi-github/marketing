import { env } from "@marketing/shared";
import { NextResponse } from "next/server";
import IORedis from "ioredis";

// Lazy singleton — only connects when the health endpoint is called.
let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  }
  return redis;
}

export async function GET() {
  try {
    const redis = getRedis();
    await redis.connect().catch(() => {}); // lazyConnect requires explicit connect
    const result = await redis.ping();
    if (result !== "PONG") throw new Error("Unexpected ping response");
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json({ status: "error", message: String(error) }, { status: 503 });
  }
}
