import { env } from "@marketing/shared";
import { NextResponse } from "next/server";
import IORedis from "ioredis";

export async function GET() {
  const redacted = env.REDIS_URL.replace(/:\/\/[^@]+@/, "://*@");
  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 5000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const result = await redis.ping();
    if (result !== "PONG") throw new Error(`Unexpected ping response: ${result}`);
    return NextResponse.json({ status: "ok", url: redacted });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: String(error), url: redacted },
      { status: 503 },
    );
  } finally {
    redis.disconnect();
  }
}
