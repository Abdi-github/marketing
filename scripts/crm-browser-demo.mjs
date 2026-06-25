import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = requireFromWeb("@playwright/test");

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const screenshotsDir = path.resolve("crm-documentaion/screenshots");
const resultsPath = path.resolve("crm-documentaion/browser-qa-results.json");

const ownerEmail = process.env.CRM_DEMO_EMAIL ?? "restaurant-owner@e2e.test";
const ownerPassword = process.env.CRM_DEMO_PASSWORD ?? "E2eTestPass1!";
const publicPath =
  process.env.CRM_DEMO_PUBLIC_PATH ?? "/p/geneva-restaurant-e2e-jz3bc/abdi-restaurant-16a3690b";

async function snapshot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({
    path: path.join(screenshotsDir, file),
    fullPage: true,
  });
  return `screenshots/${file}`;
}

async function textSample(page) {
  return page
    .locator("body")
    .innerText({ timeout: 5000 })
    .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 700))
    .catch(() => "");
}

async function recordStep(results, page, step, purpose, screenshotName) {
  const screenshot = await snapshot(page, screenshotName);
  results.steps.push({
    step,
    purpose,
    url: page.url(),
    title: await page.title().catch(() => ""),
    screenshot,
    visibleText: await textSample(page),
  });
}

async function main() {
  await mkdir(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  const results = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    publicPath,
    mode: "read-only baseline plus tenant login",
    steps: [],
    issues: [],
  };

  try {
    await page.goto(`${baseUrl}${publicPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(2500);
    await recordStep(
      results,
      page,
      "customer-public-page",
      "Customer opens the published Abdi Restaurant website and decides whether to contact the restaurant.",
      "01-customer-public-page",
    );
  } catch (error) {
    results.issues.push({
      step: "customer-public-page",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await page.goto(`${baseUrl}/en/login`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.locator('input[type="email"], input[name="email"]').first().fill(ownerEmail);
    await page
      .locator('input[type="password"], input[name="password"]')
      .first()
      .fill(ownerPassword);
    await page
      .locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
      .first()
      .click();
    await page.waitForTimeout(5000);
    await recordStep(
      results,
      page,
      "tenant-login",
      "Restaurant staff logs in to see whether new customer work is waiting.",
      "02-tenant-login-result",
    );
  } catch (error) {
    results.issues.push({
      step: "tenant-login",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const tenantPages = [
    ["/en/dashboard", "tenant-dashboard", "Staff starts from the daily dashboard."],
    ["/en/crm", "crm-contacts", "Staff reviews leads, contacts, and follow-up tasks."],
    ["/en/crm/inbox", "crm-inbox", "Staff checks customer replies that need attention."],
    [
      "/en/crm/deals",
      "crm-deals",
      "Staff tracks larger opportunities such as private dining or catering.",
    ],
    ["/en/crm/segments", "crm-segments", "Staff groups customers for future follow-up."],
    ["/en/crm/duplicates", "crm-duplicates", "Staff reviews possible duplicate customer records."],
    ["/en/integrations", "integrations-notifications", "Staff checks SMS and channel readiness."],
  ];

  for (const [route, name, purpose] of tenantPages) {
    try {
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForTimeout(2500);
      await recordStep(results, page, name, purpose, name);
    } catch (error) {
      results.issues.push({
        step: name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  await browser.close();
  console.log(`CRM browser demo wrote ${results.steps.length} screenshots.`);
  if (results.issues.length > 0) {
    console.log(`Issues: ${results.issues.length}`);
    for (const issue of results.issues) console.log(`${issue.step}: ${issue.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
