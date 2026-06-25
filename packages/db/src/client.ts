import { env } from "@marketing/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const maxConnections = env.DATABASE_POOL_MAX ?? 3;

// Singleton — module-level so both web and workers share the pool per process.
const sql = postgres(env.DATABASE_URL, {
  max: maxConnections,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
});

export const db = drizzle(sql, { schema });
export type Database = typeof db;
