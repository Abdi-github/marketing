import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const expectedTables = [
  "platform_audit_logs",
  "support_sessions",
  "tenant_support_notes",
  "email_automation_jobs",
  "sms_templates",
  "sms_sequences",
  "sms_sequence_enrollments",
  "sms_preferences",
  "sms_automation_jobs",
  "sms_phone_verifications",
];

const expectedColumns = [
  ["business_profiles", "lead_capture_settings"],
  ["messages", "message_type"],
  ["messages", "meta"],
  ["messages", "policy_state"],
  ["messages", "error_message"],
  ["crm_tasks", "meta"],
  ["leads", "workflow_kind"],
  ["leads", "workflow_state"],
  ["leads", "source_channel"],
  ["leads", "structured_data"],
  ["leads", "last_automation_at"],
  ["email_templates", "preset_key"],
  ["email_templates", "category"],
  ["email_sequences", "preset_key"],
  ["email_sequences", "category"],
  ["email_sends", "send_kind"],
  ["email_preferences", "consent_source_url"],
  ["email_preferences", "consent_captured_at"],
  ["email_preferences", "consent_meta"],
];

const expectedEnums = [
  ["message_status", "undelivered"],
  ["usage_metric", "sms_sent"],
  ["usage_metric", "sms_segments"],
  ["integration_provider", "twilio"],
];

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${expectedTables})
  `;
  const foundTables = new Set(tables.map((row) => row.table_name));

  const columns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${expectedColumns.map(([table]) => table)})
  `;
  const foundColumns = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));

  const enums = await sql`
    SELECT pg_type.typname, pg_enum.enumlabel
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = ANY(${expectedEnums.map(([type]) => type)})
  `;
  const foundEnums = new Set(enums.map((row) => `${row.typname}.${row.enumlabel}`));

  const issues = [
    ...expectedTables
      .filter((table) => !foundTables.has(table))
      .map((table) => `missing table ${table}`),
    ...expectedColumns
      .filter(([table, column]) => !foundColumns.has(`${table}.${column}`))
      .map(([table, column]) => `missing column ${table}.${column}`),
    ...expectedEnums
      .filter(([type, label]) => !foundEnums.has(`${type}.${label}`))
      .map(([type, label]) => `missing enum ${type}.${label}`),
  ];

  if (issues.length > 0) {
    throw new Error(`Recent production schema incomplete:\n- ${issues.join("\n- ")}`);
  }

  console.log("Recent production schema ready.");
} finally {
  await sql.end();
}
