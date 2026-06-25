import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const email = process.env.DEBUG_EMAIL ?? "restaurant-owner@e2e.test";
const password = process.env.DEBUG_PASSWORD ?? "E2eTestPass1!";

function parseTrpcJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    return [{ raw: text }];
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });

const captures = [];

page.on("response", async (response) => {
  const url = response.url();
  if (
    !url.includes("integrations.getSmsHealth") &&
    !url.includes("sms.getBusinessSmsSettings") &&
    !url.includes("billing.getUsageSummary")
  ) {
    return;
  }

  let body;
  try {
    body = await response.text();
  } catch (error) {
    body = `<<unreadable: ${error instanceof Error ? error.message : String(error)}>>`;
  }

  captures.push({
    url,
    status: response.status(),
    body: parseTrpcJson(body),
  });
});

try {
  await page.goto(`${baseUrl}/en/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /log in|login|sign in/i }).click();
  await page.waitForURL(/\/en\/.+/, { timeout: 30000 });
  await page.goto(`${baseUrl}/en/integrations`, { waitUntil: "networkidle" });

  const pageText = await page.locator("body").innerText();
  await mkdir("tmp", { recursive: true });
  await page.screenshot({ path: "tmp/sms-debug-page.png", fullPage: true });

  console.log(
    JSON.stringify(
      {
        baseUrl,
        finalUrl: page.url(),
        captures,
        markers: {
          hasTrial: pageText.includes("trial"),
          hasStarter: pageText.includes("starter"),
          hasProviderReady: pageText.includes("provider is ready"),
          hasProviderNotReady: pageText.includes("provider is not ready"),
          hasSetupNeeded: pageText.includes("Setup needed"),
          hasReady: pageText.includes("Ready"),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
