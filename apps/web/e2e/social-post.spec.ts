/**
 * Journey 2 — Social-post generation
 *
 * Logged-in cafe owner navigates to the post-generation form, submits a topic,
 * and sees the job enqueued (→ "Wird generiert…").
 *
 * Pass 1 assertion: the form submits successfully and shows the generating state.
 * Pass 2 (worker-dependent): tagged @worker — skipped unless WORKERS_RUNNING=true.
 * With WORKERS_RUNNING=true, the EchoProvider completes the job near-instantly
 * and the spec waits for "Generierter Post" to appear.
 */
import { test, expect } from "@playwright/test";
import { loginAsCafeOwner } from "./fixtures/auth";

const SCREENSHOTS = "e2e/screenshots";
const workersRunning = process.env.WORKERS_RUNNING === "true";

test("social-post journey — generate form + queued state", async ({ page }) => {
  await loginAsCafeOwner(page);

  // ── 1. Navigate to posts/new ─────────────────────────────────────────────
  await page.goto("/de/dashboard/posts/new");
  await expect(page.getByRole("heading", { name: /Social/ })).toBeVisible();

  // ── 2. Fill in the topic ─────────────────────────────────────────────────
  await page.fill("#topic", "Frisches Mittagsmenü aus Tessiner Zutaten");
  await page.fill("#highlights", "Vegane Option, täglich wechselnd");

  await page.screenshot({ path: `${SCREENSHOTS}/04-social-post-form.png` });

  // ── 3. Submit ─────────────────────────────────────────────────────────────
  await page.click('button[type="submit"]');

  // ── 4. Generating state ───────────────────────────────────────────────────
  await expect(page.getByText("KI generiert deinen Post")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/05-social-post-generating.png` });
});

test("@worker social-post journey — full loop with EchoProvider", async ({ page }) => {
  test.skip(!workersRunning, "Set WORKERS_RUNNING=true to run worker-dependent specs");

  await loginAsCafeOwner(page);
  await page.goto("/de/dashboard/posts/new");
  await page.fill("#topic", "Wochenspezialtät: Zürich Geschnetzeltes");
  await page.click('button[type="submit"]');

  // EchoProvider returns [ECHO] text quickly; give the worker up to 30 s.
  await expect(page.getByText("Generierter Post")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("[ECHO]")).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOTS}/06-social-post-result.png` });
});
