import { env } from "@marketing/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabasePoolConfig } from "./pool-config";

const pool = resolveDatabasePoolConfig({
  configuredMax: env.DATABASE_POOL_MAX,
  isServerless: process.env["VERCEL"] === "1" || Boolean(process.env["AWS_LAMBDA_FUNCTION_NAME"]),
});

// Singleton — module-level so both web and workers share the pool per process.
const sql = postgres(env.DATABASE_URL, {
  max: pool.max,
  idle_timeout: pool.idleTimeoutSeconds,
  connect_timeout: 10,
  max_lifetime: pool.maxLifetimeSeconds,
});

export const db = drizzle(sql, { schema });
export type Database = typeof db;
