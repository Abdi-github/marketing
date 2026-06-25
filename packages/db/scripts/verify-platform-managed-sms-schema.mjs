import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sms_phone_verifications'
  `;
  const metrics = await sql`
    SELECT enumlabel
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'usage_metric'
      AND enumlabel IN ('sms_sent', 'sms_segments')
  `;
  const foundMetrics = new Set(metrics.map((row) => row.enumlabel));
  const missing = [
    ...(tables.length > 0 ? [] : ["sms_phone_verifications"]),
    ...(["sms_sent", "sms_segments"].filter((metric) => !foundMetrics.has(metric))),
  ];

  if (missing.length > 0) {
    throw new Error(`Platform-managed SMS schema incomplete. Missing: ${missing.join(", ")}`);
  }

  console.log("Platform-managed SMS schema ready.");
} finally {
  await sql.end();
}
