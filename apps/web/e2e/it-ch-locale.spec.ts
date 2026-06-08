/**
 * IT-CH locale journey (step-17 exit criterion)
 *
 * Exit criterion per step-17: a Ticino tenant signs up via /it/, generates
 * IT-CH content, pays in CHF; this spec covers the first two legs.
 * Payment is CHF by definition (no Stripe change in step-17).
 *
 * Pass 1  — locale + marketing page + signup (no worker needed)
 * @worker — IT-CH content generation via EchoProvider (WORKERS_RUNNING=true)
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./fixtures/auth";
import { signupViaAPI, uniqueEmail } from "./fixtures/seed";
import { mkdirSync } from "fs";

const SCREENSHOTS = "e2e/screenshots";
const workersRunning = process.env.WORKERS_RUNNING === "true";

test.beforeAll(() => mkdirSync(SCREENSHOTS, { recursive: true }));

// ── 1. Marketing page renders Italian copy ────────────────────────────────────

test("it-CH marketing page — renders Italian hero and CHF pricing", async ({ page }) => {
  await page.goto("/it");

  // Middleware should serve the /it locale without redirect.
  await expect(page).toHaveURL(/\/it/);

  // Hero title from it.json
  await expect(
    page.getByRole("heading", { name: "Marketing IA per le PMI svizzere" }),
  ).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/it-01-marketing-home.png` });

  // Pricing section must show CHF (no USD change per step-17 decision)
  await expect(page.getByText("CHF 49")).toBeVisible();
  await expect(page.getByText("CHF 149")).toBeVisible();
});

test("it-CH marketing page — pricing subtitle shows no USD surprises", async ({ page }) => {
  await page.goto("/it");
  await expect(page.getByText("Nessuna sorpresa in USD")).toBeVisible({ timeout: 10_000 });
});

test("it-CH marketing page — navigation CTA is in Italian", async ({ page }) => {
  await page.goto("/it");
  // nav.signup key from it.json
  await expect(page.getByRole("link", { name: "Prova gratuitamente" })).toBeVisible({
    timeout: 10_000,
  });
});

// ── 2. Ticino tenant signup journey ──────────────────────────────────────────

test("it-CH signup — Ticino tenant signs up via /it/signup and reaches dashboard", async ({
  page,
}) => {
  const email = uniqueEmail("ticino");

  // Navigate directly to the locale-prefixed signup URL.
  await page.goto("/it/signup");
  await expect(page).toHaveURL(/\/it\/signup/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  // Fill the form
  await page.fill('[name="name"]', "Ticino E2E Owner");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', "E2eTestPass1!");
  await page.fill('[name="businessName"]', "Ristorante Al Grotto E2E");

  await page.screenshot({ path: `${SCREENSHOTS}/it-02-signup-form-filled.png` });

  // Submit
  await page.click('button[type="submit"]');

  // argon2 under concurrent load can take 15–20 s
  await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 35_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/it-03-signup-welcome.png` });

  // Session is live — dashboard is accessible
  await page.goto("/it/dashboard/posts/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Social/ })).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/it-04-dashboard-access.png` });
});

test("it-CH signup — duplicate email shows error", async ({ page }) => {
  const { email } = await signupViaAPI(page.request);

  await page.goto("/it/signup");
  await page.fill('[name="name"]', "Duplicate Ticino");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', "E2eTestPass1!");
  await page.fill('[name="businessName"]', "Grotto Duplicato");
  await page.click('button[type="submit"]');

  // Under concurrent argon2 load, the 409 response can take > 10 s.
  await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 20_000 });
});

// ── 3. IT-CH content generation (worker-dependent) ────────────────────────────

test("@worker it-CH social-post — EchoProvider returns [ECHO] text for Italian topic", async ({
  page,
}) => {
  test.skip(!workersRunning, "Set WORKERS_RUNNING=true to run worker-dependent specs");

  // Sign up a fresh Ticino tenant, then log in.
  const { email, password } = await signupViaAPI(page.request, {
    name: "Ticino Worker Test",
    businessName: "Trattoria del Sole E2E",
  });
  await loginViaAPI(page, email, password);

  await page.goto("/it/dashboard/posts/new");
  await expect(page.getByRole("heading", { name: /Social/ })).toBeVisible();

  // Submit an Italian topic to trigger the social-post worker.
  await page.fill("#topic", "Risotto al tartufo di stagione — specialità del Ticino");
  await page.fill("#highlights", "Ingredienti locali, vista lago");

  await page.screenshot({ path: `${SCREENSHOTS}/it-05-social-post-form.png` });
  await page.click('button[type="submit"]');

  // Queued / generating state
  await expect(page.getByText("KI generiert deinen Post")).toBeVisible({ timeout: 15_000 });

  // EchoProvider returns near-instantly with [ECHO] prefix.
  await expect(page.getByText("Generierter Post")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("[ECHO]")).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOTS}/it-06-social-post-result.png` });
});
