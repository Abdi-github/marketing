/**
 * Journey 1 — Sign-up
 *
 * New visitor fills the signup form, account + tenant are created atomically,
 * Better-Auth issues a session cookie, and the user lands on the welcome screen.
 * The test then confirms the session is live by navigating to the posts page.
 */
import { test, expect } from "@playwright/test";
import { signupViaAPI, uniqueEmail } from "./fixtures/seed";
import { mkdirSync } from "fs";

const SCREENSHOTS = "e2e/screenshots";

test.beforeAll(() => mkdirSync(SCREENSHOTS, { recursive: true }));

test("signup journey — form → welcome → authenticated dashboard", async ({ page, request }) => {
  // Navigate directly to the locale-prefixed signup URL.
  // We don't test the Accept-Language redirect here — that's locale middleware
  // behaviour covered by NOTE-01; it varies by browser/OS locale and would be
  // flaky in CI (Playwright Chrome defaults to en-US → redirects to /en).
  const email = uniqueEmail("signup");
  await page.goto("/de/signup");
  await expect(page).toHaveURL(/\/de\/signup/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  // ── 3. Fill the form ────────────────────────────────────────────────────
  await page.fill('[name="name"]', "E2E Signup User");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', "E2eTestPass1!");
  await page.fill('[name="businessName"]', "E2E Signup Cafe");

  await page.screenshot({ path: `${SCREENSHOTS}/01-signup-form-filled.png` });

  // ── 4. Submit ───────────────────────────────────────────────────────────
  await page.click('button[type="submit"]');

  // ── 5. Welcome screen ───────────────────────────────────────────────────
  // argon2 hash under concurrent test load can take 15-20s; allow extra time.
  await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 35_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/02-signup-welcome.png` });

  // ── 6. Session is live — posts page loads (tRPC authed) ─────────────────
  // waitUntil:"domcontentloaded" avoids NS_ERROR_ABORT in Firefox under heavy
  // server load where the "load" event fires late or connection resets.
  await page.goto("/de/dashboard/posts/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Social/ })).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/03-signup-dashboard-access.png` });
});

test("duplicate email → signup shows an error", async ({ page }) => {
  // Seed a user first via API
  const { email } = await signupViaAPI(page.request);

  // Attempt to sign up with the same email via the UI
  await page.goto("/de/signup");
  await page.fill('[name="name"]', "Duplicate User");
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', "E2eTestPass1!");
  await page.fill('[name="businessName"]', "Duplicate Business");
  await page.click('button[type="submit"]');

  // The signup tRPC mutation should return an error.
  // Under concurrent argon2 load the 409 response can take > 10s.
  await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 20_000 });
});
