import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromDb = createRequire(path.resolve("packages/db/package.json"));
const postgres = requireFromDb("postgres");

const envText = await readFile(path.resolve(".env.local"), "utf8");
const line = envText.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL missing");

const sql = postgres(line.slice("DATABASE_URL=".length), { max: 1 });
try {
  const rows = await sql.unsafe(`
    select
      t.slug as tenant_slug,
      f.slug as form_slug,
      f.name,
      f.schema,
      f.steps,
      f.settings
    from forms f
    join tenants t on t.id = f.tenant_id
    where t.slug = 'geneva-restaurant-e2e-jz3bc'
      and f.is_active = true
    order by f.updated_at desc
    limit 5
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end();
}
