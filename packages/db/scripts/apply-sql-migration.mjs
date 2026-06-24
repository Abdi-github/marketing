import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const filename = process.argv[2];
if (!filename || !/^\d{4}_[a-z0-9_-]+\.sql$/i.test(filename)) {
  throw new Error("Usage: node scripts/apply-sql-migration.mjs <migration-file.sql>");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const migrationPath = path.resolve("migrations", filename);
const migrationRoot = path.resolve("migrations");
if (!migrationPath.startsWith(`${migrationRoot}${path.sep}`)) {
  throw new Error("Migration must be inside packages/db/migrations.");
}

const contents = await readFile(migrationPath, "utf8");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.unsafe(contents);
  console.log(`Applied ${filename}`);
} finally {
  await sql.end();
}
