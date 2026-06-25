/* global console, process */

import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(path.resolve("apps/web/package.json"));
const { chromium } = requireFromWeb("@playwright/test");

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const ownerEmail = process.env.CRM_DEMO_EMAIL ?? "restaurant-owner@e2e.test";
const ownerPassword = process.env.CRM_DEMO_PASSWORD ?? "E2eTestPass1!";
const contactId = process.env.CRM_DEMO_CONTACT_ID ?? "35405558-f993-42c0-9905-993898852d60";

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
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const events = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      events.push({ type: "console", level: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    events.push({ type: "pageerror", text: error.message });
  });
  page.on("response", async (response) => {
    if (response.status() >= 400 || response.url().includes("/api/trpc/")) {
      events.push({
        type: "response",
        status: response.status(),
        url: response.url().slice(0, 240),
        text: await response.text().catch(() => ""),
      });
    }
  });

  await loginIfNeeded(page);
  await page.goto(`${baseUrl}/en/crm?contactId=${contactId}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForTimeout(45_000);
  await page.screenshot({
    path: path.resolve("crm-documentaion/screenshots/23-contact-debug.png"),
    fullPage: true,
  });
  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  await writeFile(
    path.resolve("crm-documentaion/contact-debug-results.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), url: page.url(), text, events }, null, 2)}\n`,
  );
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
