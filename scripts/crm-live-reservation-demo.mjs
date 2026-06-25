/* global console, getComputedStyle, process */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(path.resolve("apps/web/package.json"));
const requireFromDb = createRequire(path.resolve("packages/db/package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const postgres = requireFromDb("postgres");

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const publicPath =
  process.env.CRM_DEMO_PUBLIC_PATH ?? "/p/geneva-restaurant-e2e-jz3bc/abdi-restaurant-d5edaf2d";
const ownerEmail = process.env.CRM_DEMO_EMAIL ?? "restaurant-owner@e2e.test";
const ownerPassword = process.env.CRM_DEMO_PASSWORD ?? "E2eTestPass1!";
const customerPhone = process.env.CRM_DEMO_PHONE ?? "+41762147690";
const customerName = process.env.CRM_DEMO_NAME ?? "Abdi CRM Demo Guest";
const customerEmail = process.env.CRM_DEMO_CUSTOMER_EMAIL ?? `crm.demo.${Date.now()}@example.test`;
const headed = process.env.CRM_DEMO_HEADED === "1";
const keepOpen = process.env.CRM_DEMO_KEEP_OPEN === "1" || headed;
const keepOpenMs = Number(process.env.CRM_DEMO_KEEP_OPEN_MS ?? 30 * 60 * 1000);

const screenshotsDir = path.resolve("crm-documentaion/screenshots");
const resultsPath = path.resolve("crm-documentaion/live-reservation-results.json");

function readDatabaseUrl() {
  const envPath = path.resolve(".env.local");
  return readFile(envPath, "utf8").then((contents) => {
    const line = contents.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
    if (!line) throw new Error("DATABASE_URL not found in .env.local");
    return line.slice("DATABASE_URL=".length);
  });
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
    .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 900))
    .catch(() => "");
}

async function visibleControls(page) {
  return page.locator("input, textarea, select, button").evaluateAll((controls) =>
    controls.map((control) => {
      const el = control;
      return {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        placeholder: el.getAttribute("placeholder"),
        ariaLabel: el.getAttribute("aria-label"),
        text: el.textContent?.trim() ?? "",
        required: el.hasAttribute("required"),
        visible:
          !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) &&
          getComputedStyle(el).visibility !== "hidden",
      };
    }),
  );
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.fill(value);
    return selector;
  }
  return null;
}

async function checkFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.check({ force: true }).catch(async () => {
      await locator.click({ force: true });
    });
    return selector;
  }
  return null;
}

async function selectSmsPreference(page) {
  const smsSelectors = [
    'input[value="sms"]',
    'input[name*="preferred"][value="sms"]',
    'input[name*="channel"][value="sms"]',
    'select[name*="preferred"]',
    'select[name*="channel"]',
  ];

  for (const selector of smsSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") {
      await locator.selectOption({ value: "sms" }).catch(async () => {
        await locator.selectOption({ label: /sms/i });
      });
    } else {
      await locator.check({ force: true }).catch(async () => {
        await locator.click({ force: true });
      });
    }
    return selector;
  }
  return null;
}

async function latestDatabaseState(sql) {
  const rows = await sql.unsafe(`
    select
      l.id as lead_id,
      l.workflow_kind,
      l.workflow_state,
      l.submitted_at as lead_submitted_at,
      c.id as contact_id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      n.id as notification_id,
      n.title as notification_title,
      n.status as notification_status,
      n.created_at as notification_created_at
    from leads l
    left join contacts c on c.id = l.contact_id
    left join notifications n on n.entity_id = c.id or n.entity_id = l.id
    where l.submitted_at > now() - interval '30 minutes'
    order by l.submitted_at desc, n.created_at desc nulls last
    limit 5
  `);
  return rows.map((row) => ({
    ...row,
    email: row.email?.replace(/(.{2}).+(@.*)/, "$1***$2") ?? null,
    phone: row.phone ? `${row.phone.slice(0, 4)}***${row.phone.slice(-3)}` : null,
  }));
}

async function main() {
  const sql = postgres(await readDatabaseUrl(), { max: 1 });
  const browser = await chromium.launch({
    channel: "msedge",
    headless: !headed,
    slowMo: headed ? 650 : 0,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    publicPath,
    customer: {
      name: customerName,
      phone: `${customerPhone.slice(0, 4)}***${customerPhone.slice(-3)}`,
      email: customerEmail.replace(/(.{2}).+(@.*)/, "$1***$2"),
    },
    steps: [],
    filled: {},
    controls: [],
    database: {},
    issues: [],
  };

  try {
    await page.goto(`${baseUrl}${publicPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(2500);
    result.controls = await visibleControls(page);
    result.steps.push({
      step: "customer-open-page",
      screenshot: await screenshot(page, "10-live-customer-open-page"),
      visibleText: await bodyText(page),
    });

    result.filled.name = await fillFirst(
      page,
      ['input[name="name"]', 'input[name="full_name"]', 'input[placeholder*="name" i]'],
      customerName,
    );
    result.filled.email = await fillFirst(
      page,
      ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="email" i]'],
      customerEmail,
    );
    result.filled.phone = await fillFirst(
      page,
      [
        'input[name="phone"]',
        'input[type="tel"]',
        'input[placeholder*="phone" i]',
        'input[placeholder*="mobile" i]',
      ],
      customerPhone,
    );
    result.filled.date = await fillFirst(
      page,
      ['input[name="date"]', 'input[name="reservation_date"]', 'input[type="date"]'],
      "2026-07-04",
    );
    result.filled.time = await fillFirst(
      page,
      ['input[name="time"]', 'input[name="reservation_time"]', 'input[type="time"]'],
      "19:30",
    );
    result.filled.partySize = await fillFirst(
      page,
      [
        'input[name="party_size"]',
        'input[name="guest_count"]',
        'input[name="guests"]',
        'input[placeholder*="guest" i]',
        'input[placeholder*="party" i]',
      ],
      "2",
    );
    result.filled.message = await fillFirst(
      page,
      ['textarea[name="message"]', 'textarea[name="notes"]', "textarea", 'input[name="message"]'],
      "We would like a quiet table for two. Please confirm by SMS.",
    );
    result.filled.smsPreference = await selectSmsPreference(page);
    result.filled.smsConsent = await checkFirst(page, [
      'input[name="sms_marketing_consent"]',
      'input[name="smsOptIn"]',
      'input[name="sms_opt_in"]',
    ]);

    await page.waitForTimeout(500);
    result.steps.push({
      step: "customer-filled-form",
      screenshot: await screenshot(page, "11-live-customer-filled-form"),
      visibleText: await bodyText(page),
    });

    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    await nextButton.click();
    await page.waitForTimeout(1500);

    result.controlsAfterNext = await visibleControls(page);
    result.filled.dateAfterNext = await fillFirst(
      page,
      ['input[name="date"]', 'input[name="reservation_date"]', 'input[type="date"]'],
      "2026-07-04",
    );
    result.filled.timeAfterNext = await fillFirst(
      page,
      ['input[name="time"]', 'input[name="reservation_time"]', 'input[type="time"]'],
      "19:30",
    );
    result.filled.partySizeAfterNext = await fillFirst(
      page,
      [
        'input[name="party_size"]',
        'input[name="guest_count"]',
        'input[name="guests"]',
        'input[placeholder*="guest" i]',
        'input[placeholder*="party" i]',
      ],
      "2",
    );
    result.filled.messageAfterNext = await fillFirst(
      page,
      ['textarea[name="message"]', 'textarea[name="notes"]', "textarea", 'input[name="message"]'],
      "We would like a quiet table for two. Please confirm by SMS.",
    );
    await page.waitForTimeout(500);
    result.steps.push({
      step: "customer-filled-second-step",
      screenshot: await screenshot(page, "12-live-customer-filled-second-step"),
      visibleText: await bodyText(page),
    });

    const finalSubmitButton = page
      .locator(
        'button:has-text("Request booking"), button:has-text("Book"), button:has-text("Reserve"), button:has-text("Send"), button:has-text("Submit"), button:has-text("Request")',
      )
      .first();
    const formResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/forms/") && response.request().method() === "POST",
        { timeout: 35_000 },
      )
      .then(async (response) => ({
        status: response.status(),
        ok: response.ok(),
        url: response.url().replace(/\?.*$/, ""),
        body: await response.text().catch(() => ""),
      }))
      .catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
    await finalSubmitButton.click();
    result.formResponse = await formResponsePromise;
    await Promise.race([
      page
        .locator("text=/thank|success|received|taking longer|error|try again/i")
        .first()
        .waitFor({ timeout: 35_000 })
        .catch(() => undefined),
      page.waitForTimeout(35_000),
    ]);
    await page.waitForTimeout(1500);
    result.steps.push({
      step: "customer-submit-result",
      screenshot: await screenshot(page, "13-live-customer-submit-result"),
      visibleText: await bodyText(page),
    });

    result.database.afterSubmission = await latestDatabaseState(sql);

    await page.goto(`${baseUrl}/en/login`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    if (page.url().includes("/login")) {
      await page.locator('input[type="email"], input[name="email"]').first().fill(ownerEmail);
      await page
        .locator('input[type="password"], input[name="password"]')
        .first()
        .fill(ownerPassword);
      await page
        .locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
        .first()
        .click();
      await page.waitForTimeout(6000);
    }

    for (const [route, name] of [
      ["/en/dashboard", "14-live-tenant-dashboard"],
      ["/en/crm", "15-live-tenant-crm"],
      ["/en/crm/inbox", "16-live-tenant-inbox"],
    ]) {
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForTimeout(5000);
      result.steps.push({
        step: name,
        screenshot: await screenshot(page, name),
        visibleText: await bodyText(page),
        url: page.url(),
      });
    }
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

  console.log(`Live CRM demo wrote ${result.steps.length} steps.`);
  if (result.issues.length > 0) {
    console.log(`Issues: ${result.issues.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
