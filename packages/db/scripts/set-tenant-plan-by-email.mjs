import postgres from "postgres";

const email = process.argv[2];
const plan = process.argv[3];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  throw new Error(
    "Usage: node scripts/set-tenant-plan-by-email.mjs <email> [trial|starter|growth]",
  );
}
if (plan && !["trial", "starter", "growth"].includes(plan)) {
  throw new Error("Plan must be trial, starter, or growth.");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  if (plan) {
    await sql`
      UPDATE tenants
      SET plan = ${plan}, updated_at = now()
      WHERE id IN (
        SELECT tenant_users.tenant_id
        FROM users
        JOIN tenant_users ON tenant_users.user_id = users.id
        WHERE users.email = ${email}
      )
    `;
  }

  const rows = await sql`
    SELECT
      users.email,
      tenants.id AS tenant_id,
      tenants.slug,
      tenants.name,
      tenants.plan,
      tenants.suspended
    FROM users
    JOIN tenant_users ON tenant_users.user_id = users.id
    JOIN tenants ON tenants.id = tenant_users.tenant_id
    WHERE users.email = ${email}
    ORDER BY tenants.created_at DESC
  `;

  if (rows.length === 0) {
    throw new Error(`No tenant found for ${email}`);
  }

  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
