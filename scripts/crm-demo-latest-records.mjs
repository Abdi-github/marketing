import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromDb = createRequire(path.resolve("packages/db/package.json"));
const postgres = requireFromDb("postgres");

const envText = await readFile(path.resolve(".env.local"), "utf8");
const line = envText.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL missing");

const sql = postgres(line.slice("DATABASE_URL=".length), { max: 1 });

function maskEmail(email) {
  return typeof email === "string" ? email.replace(/(.{2}).+(@.*)/, "$1***$2") : null;
}

function maskPhone(phone) {
  return typeof phone === "string" ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : null;
}

try {
  const rows = await sql.unsafe(`
    select
      l.id as lead_id,
      l.workflow_kind,
      l.workflow_state,
      l.submitted_at,
      c.id as contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      n.title as notification_title,
      n.status as notification_status,
      n.created_at as notification_created_at
    from leads l
    left join contacts c on c.id = l.contact_id
    left join notifications n on n.entity_id = c.id or n.entity_id = l.id
    where l.submitted_at > now() - interval '20 minutes'
    order by l.submitted_at desc, n.created_at desc nulls last
    limit 10
  `);
  console.log(
    JSON.stringify(
      rows.map((row) => ({
        ...row,
        email: maskEmail(row.email),
        phone: maskPhone(row.phone),
      })),
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
