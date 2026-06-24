import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const expectedTables = [
  "sms_templates",
  "sms_sequences",
  "sms_sequence_enrollments",
  "sms_preferences",
  "sms_automation_jobs",
];

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${expectedTables})
  `;
  const found = new Set(tables.map((row) => row.table_name));
  const missing = expectedTables.filter((table) => !found.has(table));
  const statuses = await sql`
    SELECT enumlabel
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'message_status'
  `;
  const hasUndelivered = statuses.some((row) => row.enumlabel === "undelivered");
  if (missing.length > 0 || !hasUndelivered) {
    throw new Error(
      `SMS schema incomplete. Missing tables: ${missing.join(", ") || "none"}; undelivered=${hasUndelivered}`,
    );
  }
  console.log(`SMS schema ready: ${expectedTables.join(", ")}; message_status=undelivered`);
} finally {
  await sql.end();
}
