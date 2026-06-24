/* global console, document, NodeFilter, process */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const outputRoot = path.resolve("../../sms-documentaion/screenshots");
const results = [];

async function redactVisiblePersonalData(page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      node.textContent = (node.textContent ?? "")
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "a***@example.test")
        .replace(/\+41[\d\s]{8,}/g, "+41 ** *** ** **");
      node = walker.nextNode();
    }
  });
}

async function capture(page, folder, filename, fullPage = false) {
  const directory = path.join(outputRoot, folder);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, filename);
  await redactVisiblePersonalData(page);
  await page.screenshot({ path: target, fullPage });
  return path.relative(path.resolve("../.."), target).replaceAll("\\", "/");
}

async function record(name, action) {
  try {
    const detail = await action();
    results.push({ name, result: "PASS", ...detail });
  } catch (error) {
    results.push({
      name,
      result: "FAIL",
      note: error instanceof Error ? error.message : String(error),
    });
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  desktop.setDefaultTimeout(90_000);
  const page = await desktop.newPage();

  await record("Published restaurant reservation page", async () => {
    await page.goto(`${baseUrl}/p/geneva-restaurant-e2e-jz3bc/abdi-restaurant-d5edaf2d`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.getByText("Reserve a table", { exact: true }).first().waitFor();
    await page.getByText("Neuchatel, Switzerland", { exact: true }).first().waitFor();
    await page.getByText("Neuchatel's Finest Table", { exact: true }).waitFor();
    const screenshot = await capture(
      page,
      "02-restaurant-golden-path",
      "01-published-restaurant-page.png",
    );
    return { screenshot, url: page.url() };
  });

  await record("Reservation form and preferred channels", async () => {
    const form = page.locator("form").last();
    await form.scrollIntoViewIfNeeded();
    await form.locator('input[name="phone"]').waitFor();
    await form.getByText("SMS", { exact: true }).waitFor();
    const screenshot = await capture(
      page,
      "02-restaurant-golden-path",
      "02-reservation-form-channels.png",
    );
    return { screenshot };
  });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  mobile.setDefaultTimeout(90_000);
  const mobilePage = await mobile.newPage();
  await record("Mobile restaurant navigation and form", async () => {
    await mobilePage.goto(`${baseUrl}/p/geneva-restaurant-e2e-jz3bc/abdi-restaurant-d5edaf2d`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const screenshot = await capture(
      mobilePage,
      "02-restaurant-golden-path",
      "03-mobile-restaurant-page.png",
    );
    return { screenshot };
  });
  await mobile.close();

  await record("Restaurant owner login", async () => {
    const response = await page.request.post(`${baseUrl}/api/auth/sign-in/email`, {
      data: {
        email: "restaurant-owner@e2e.test",
        password: "E2eTestPass1!",
      },
      headers: { "Content-Type": "application/json" },
      timeout: 90_000,
    });
    if (!response.ok()) {
      throw new Error(`Login returned ${response.status()}: ${await response.text()}`);
    }
    return {};
  });

  await record("SMS provider readiness panel", async () => {
    await page.goto(`${baseUrl}/en/integrations`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.getByRole("heading", { name: "SMS automation" }).waitFor();
    await page.getByText("Twilio", { exact: true }).first().waitFor();
    const sectionText =
      (await page
        .getByRole("heading", { name: "SMS automation" })
        .locator("xpath=ancestor::section")
        .textContent()) ?? "";
    if (sectionText.includes("Not configured")) {
      throw new Error("Twilio is selected but the tenant credential resolver is not ready.");
    }
    const screenshot = await capture(page, "01-provider-readiness", "01-twilio-health-no-send.png");
    return { screenshot, note: "No test SMS button was clicked." };
  });

  await record("Restaurant SMS presets and automation builder", async () => {
    await page.goto(`${baseUrl}/en/sms-automation`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const install = page.getByRole("button", { name: "Install restaurant presets" });
    if (await install.isVisible()) {
      await install.click();
      await page.getByText("Restaurant SMS presets are ready.").waitFor();
      await page.waitForTimeout(1000);
    }
    await page.getByRole("heading", { name: "Sequences" }).waitFor();
    const screenshot = await capture(
      page,
      "04-sms-templates-and-sequences",
      "01-restaurant-presets-and-builder.png",
    );
    return { screenshot };
  });

  await record("CRM Inbox SMS operations", async () => {
    await page.goto(`${baseUrl}/en/crm/inbox`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.getByText("Loading messages...").waitFor({ state: "hidden" });
    const screenshot = await capture(
      page,
      "03-missing-details-and-two-way-replies",
      "01-crm-inbox-before-replies.png",
    );
    return { screenshot };
  });

  await desktop.close();
} finally {
  await browser.close();
}

const reportPath = path.resolve("../../sms-documentaion/browser-qa-results.json");
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(JSON.stringify(results, null, 2));

if (results.some((result) => result.result === "FAIL")) {
  process.exitCode = 1;
}
