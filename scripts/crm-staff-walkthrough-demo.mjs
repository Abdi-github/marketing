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
const keepOpen = process.env.CRM_DEMO_KEEP_OPEN === "1" || headed;
const keepOpenMs = Number(process.env.CRM_DEMO_KEEP_OPEN_MS ?? 30 * 60 * 1000);

const screenshotsDir = path.resolve("crm-documentaion/screenshots");
const resultsPath = path.resolve("crm-documentaion/staff-walkthrough-results.json");

async function readDatabaseUrl() {
  const contents = await readFile(path.resolve(".env.local"), "utf8");
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice("DATABASE_URL=".length);
}

async function screenshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({
    path: path.join(screenshotsDir, file),
    fullPage: true,
  });
  return `screenshots/${file}`;
}

async function bodyText(page) {
  return page
    .locator("body")
    .innerText({ timeout: 10_000 })
    .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 1200))
    .catch(() => "");
}

async function latestReservation(sql) {
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
      n.id as notification_id,
      n.title as notification_title,
      n.status as notification_status,
      n.action_url
    from leads l
    left join contacts c on c.id = l.contact_id
    left join notifications n on n.entity_id = c.id or n.entity_id = l.id
    where l.workflow_kind = 'booking'
    order by l.submitted_at desc, n.created_at desc nulls last
    limit 1
  `);
  const row = rows[0];
  if (!row) throw new Error("No recent booking lead found");
  return {
    ...row,
    email: row.email?.replace(/(.{2}).+(@.*)/, "$1***$2") ?? null,
    phone: row.phone ? `${row.phone.slice(0, 4)}***${row.phone.slice(-3)}` : null,
  };
}

async function loginIfNeeded(page) {
  await page.goto(`${baseUrl}/en/login`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
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
  const latest = await latestReservation(sql);
  const browser = await chromium.launch({
    channel: "msedge",
    headless: !headed,
    slowMo: headed ? 750 : 0,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    latest,
    steps: [],
    issues: [],
  };

  try {
    await loginIfNeeded(page);

    await page.goto(`${baseUrl}/en/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(4000);
    result.steps.push({
      step: "staff-dashboard-start",
      screenshot: await screenshot(page, "17-staff-dashboard-start"),
      visibleText: await bodyText(page),
      explanation:
        "Staff start here. The dashboard is the daily overview before opening CRM details.",
    });

    await page.getByLabel("Open notifications").click();
    await page.waitForTimeout(2500);
    result.steps.push({
      step: "staff-notification-bell-open",
      screenshot: await screenshot(page, "18-staff-notification-bell-open"),
      visibleText: await bodyText(page),
      explanation:
        "The notification bell shows new work. A reservation alert means staff should open the customer and confirm or ask for missing details.",
    });

    const contactUrl = `${baseUrl}/en/crm?contactId=${latest.contact_id}`;
    await page.goto(contactUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(9000);
    result.steps.push({
      step: "staff-open-contact-from-alert",
      screenshot: await screenshot(page, "19-staff-open-contact-from-alert"),
      visibleText: await bodyText(page),
      url: page.url(),
      explanation:
        "Opening the alert should take staff to the customer record. This is where they review the reservation request, customer history, and follow-up tasks.",
    });

    await page.goto(`${baseUrl}/en/crm/inbox`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(7000);
    result.steps.push({
      step: "staff-open-inbox",
      screenshot: await screenshot(page, "20-staff-open-inbox"),
      visibleText: await bodyText(page),
      url: page.url(),
      explanation: "Inbox is where SMS, WhatsApp, and email replies become staff conversations.",
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

  console.log(`Staff walkthrough wrote ${result.steps.length} steps.`);
  if (result.issues.length > 0) {
    console.log(`Issues: ${result.issues.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
