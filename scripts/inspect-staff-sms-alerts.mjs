/* global console, process */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromDb = createRequire(path.resolve("packages/db/package.json"));
const postgres = requireFromDb("postgres");

const tenantSlug = process.argv[2] ?? "geneva-restaurant-e2e-jz3bc";
const limit = Number(process.argv[3] ?? 10);

async function readDatabaseUrl() {
  const contents = await readFile(path.resolve(".env.local"), "utf8");
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice("DATABASE_URL=".length);
}

const sql = postgres(await readDatabaseUrl(), { max: 1 });

try {
  const [tenant] = await sql`
    select
      id,
      slug,
      name,
      plan
    from tenants
    where slug = ${tenantSlug}
    limit 1
  `;

  if (!tenant) {
    console.log(`Tenant not found: ${tenantSlug}`);
    process.exit(1);
  }

  const [profile] = await sql`
    select lead_capture_settings
    from business_profiles
    where tenant_id = ${tenant.id}
    limit 1
  `;

  const [prefs] = await sql`
    select
      in_app_enabled,
      staff_sms_enabled,
      staff_sms_phone,
      quiet_hours_start,
      quiet_hours_end,
      timezone
    from notification_preferences
    where tenant_id = ${tenant.id}
    limit 1
  `;

  const rows = await sql`
    select
      id,
      status,
      to_address,
      from_address,
      external_id,
      error_message,
      body,
      meta,
      occurred_at
    from messages
    where tenant_id = ${tenant.id}
      and channel = 'sms'
      and direction = 'outbound'
      and message_type = 'staff_alert'
    order by occurred_at desc
    limit ${limit}
  `;

  console.log(
    JSON.stringify(
      {
        inspectedAt: new Date().toISOString(),
        tenant,
        smsBusinessPhone: profile?.lead_capture_settings?.sms?.businessPhone ?? null,
        notificationPreferences: prefs ?? null,
        staffAlerts: rows.map((row) => ({
          id: row.id,
          status: row.status,
          toAddress: row.to_address
            ? `${row.to_address.slice(0, 4)}***${row.to_address.slice(-3)}`
            : null,
          fromAddress: row.from_address,
          externalId: row.external_id,
          errorMessage: row.error_message,
          body: row.body,
          meta: row.meta,
          occurredAt: row.occurred_at,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
