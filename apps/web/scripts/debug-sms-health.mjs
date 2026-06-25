import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const email = process.env.DEBUG_EMAIL ?? "restaurant-owner@e2e.test";
const password = process.env.DEBUG_PASSWORD ?? "E2eTestPass1!";

function parseTrpcJson(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [{ raw: text }];
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
const page = await context.newPage();
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
  const signInResponse = await context.request.post(`${baseUrl}/api/auth/sign-in/email`, {
    data: {
      email,
      password,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });
  const signInBody = await signInResponse.text();

  const whoamiResponse = await context.request.get(`${baseUrl}/api/trpc/auth.whoami`);
  const whoamiBody = await whoamiResponse.text();

  await page.goto(`${baseUrl}/en/integrations`, { waitUntil: "networkidle" });
  const businessPhoneInput = page.getByPlaceholder("+41761234567").nth(1);
  await businessPhoneInput.fill("+41762147690");
  const sendCodeButton = page.getByRole("button", { name: /send code/i });
  const sendCodeDisabled = await sendCodeButton.isDisabled();

  const pageText = await page.locator("body").innerText();
  await mkdir("tmp", { recursive: true });
  await page.screenshot({ path: "tmp/sms-debug-page.png", fullPage: true });

  console.log(
    JSON.stringify(
      {
        baseUrl,
        finalUrl: page.url(),
        auth: {
          signInStatus: signInResponse.status(),
          signInBody: parseTrpcJson(signInBody),
          whoamiStatus: whoamiResponse.status(),
          whoamiBody: parseTrpcJson(whoamiBody),
        },
        captures,
        markers: {
          hasTrial: pageText.includes("trial"),
          hasStarter: pageText.includes("starter"),
          hasProviderReady: pageText.includes("provider is ready"),
          hasProviderNotReady: pageText.includes("provider is not ready"),
          hasSetupNeeded: pageText.includes("Setup needed"),
          hasReady: pageText.includes("Ready"),
        },
        interactions: {
          sendCodeDisabled,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
