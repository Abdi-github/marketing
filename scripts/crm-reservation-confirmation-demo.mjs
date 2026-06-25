/* global console, process */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(path.resolve("apps/web/package.json"));
const requireFromDb = createRequire(path.resolve("packages/db/package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const postgres = requireFromDb("postgres");

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const ownerEmail = process.env.CRM_DEMO_EMAIL ?? "restaurant-owner@e2e.test";
const ownerPassword = process.env.CRM_DEMO_PASSWORD ?? "E2eTestPass1!";
const headed = process.env.CRM_DEMO_HEADED === "1";
const keepOpen = process.env.CRM_DEMO_KEEP_OPEN === "1";
const keepOpenMs = Number(process.env.CRM_DEMO_KEEP_OPEN_MS ?? 10 * 60 * 1000);

const screenshotsDir = path.resolve("crm-documentaion/screenshots");
const resultsPath = path.resolve("crm-documentaion/reservation-confirmation-results.json");

async function readDatabaseUrl() {
  const contents = await readFile(path.resolve(".env.local"), "utf8");
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice("DATABASE_URL=".length);
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(screenshotsDir, file), fullPage: true });
  return `screenshots/${file}`;
}

async function bodyText(page) {
  return page
    .locator("body")
    .innerText({ timeout: 10_000 })
    .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 1400))
    .catch(() => "");
}

async function latestAwaitingReservation(sql) {
  const rows = await sql.unsafe(`
    select
      l.id as lead_id,
      l.workflow_kind,
      l.workflow_state,
      l.status,
      l.submitted_at,
      c.id as contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone
    from leads l
    join contacts c on c.id = l.contact_id
    where l.workflow_kind = 'booking'
      and l.workflow_state in ('awaiting_confirmation', 'contacted', 'missing_details')
    order by l.submitted_at desc
    limit 1
  `);
  const row = rows[0];
  if (!row) throw new Error("No awaiting reservation lead found");
  return {
    ...row,
    email: row.email?.replace(/(.{2}).+(@.*)/, "$1***$2") ?? null,
    phone: row.phone ? `${row.phone.slice(0, 4)}***${row.phone.slice(-3)}` : null,
  };
}

async function leadState(sql, leadId) {
  const rows = await sql.unsafe(
    `
      select
        l.id as lead_id,
        l.workflow_state,
        l.status,
        count(t.id) filter (where t.status = 'open') as open_tasks,
        count(t.id) filter (where t.status = 'done') as done_tasks
      from leads l
      left join crm_tasks t
        on t.tenant_id = l.tenant_id
       and (t.meta->>'leadId' = l.id::text or t.meta->>'latestLeadId' = l.id::text)
      where l.id = $1
      group by l.id
    `,
    [leadId],
  );
  return rows[0] ?? null;
}

async function loginIfNeeded(page) {
  await page.goto(`${baseUrl}/en/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!page.url().includes("/login")) return;
  await page.locator('input[type="email"], input[name="email"]').first().fill(ownerEmail);
  await page.locator('input[type="password"], input[name="password"]').first().fill(ownerPassword);
  await page
    .locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
    .first()
    .click();
  await page
    .waitForURL(/\/en\/(dashboard|setup|crm|integrations)/, { timeout: 60_000 })
    .catch(() => undefined);
}

async function main() {
  const sql = postgres(await readDatabaseUrl(), { max: 1 });
  const reservation = await latestAwaitingReservation(sql);
  const browser = await chromium.launch({
    channel: "msedge",
    headless: !headed,
    slowMo: headed ? 750 : 0,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    reservation,
    before: await leadState(sql, reservation.lead_id),
    after: null,
    steps: [],
    issues: [],
  };

  try {
    await loginIfNeeded(page);
    await page.goto(`${baseUrl}/en/crm?contactId=${reservation.contact_id}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.getByText(/Follow-up queue/i).waitFor({ timeout: 120_000 });
    await page
      .getByRole("button", { name: /^Confirm reservation$/i })
      .first()
      .waitFor({ timeout: 120_000 });
    await page.waitForTimeout(1500);
    result.steps.push({
      step: "reservation-contact-before-confirm",
      screenshot: await screenshot(page, "21-reservation-contact-before-confirm"),
      visibleText: await bodyText(page),
      explanation:
        "Staff opens the CRM queue. The reservation task has a direct confirmation action, so the team does not need to hunt through the customer history.",
    });

    const confirmButton = page.getByRole("button", { name: /^Confirm reservation$/i }).first();
    if ((await confirmButton.count()) === 0) {
      throw new Error("Confirm reservation button was not visible.");
    }
    await confirmButton.scrollIntoViewIfNeeded().catch(() => undefined);
    await confirmButton.click();
    await page.waitForTimeout(5000);
    result.after = await leadState(sql, reservation.lead_id);
    result.steps.push({
      step: "reservation-contact-after-confirm",
      screenshot: await screenshot(page, "22-reservation-contact-after-confirm"),
      visibleText: await bodyText(page),
      explanation:
        "After staff confirms, the lead status becomes confirmed and the related follow-up task is completed.",
    });
  } catch (error) {
    result.issues.push(error instanceof Error ? error.message : String(error));
  } finally {
    await writeFile(resultsPath, `${JSON.stringify(result, null, 2)}\n`);
    if (keepOpen) {
      console.log(`Keeping Edge open for ${Math.round(keepOpenMs / 60000)} minutes for review...`);
      await page.waitForTimeout(keepOpenMs).catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
    await sql.end();
  }

  console.log(`Reservation confirmation demo wrote ${result.steps.length} steps.`);
  if (result.issues.length > 0) {
    console.log(`Issues: ${result.issues.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
