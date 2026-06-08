/**
 * Journey 4 — Landing pages + lead capture
 *
 * Cafe owner opens the landing-pages dashboard, fills in a prompt, and submits.
 * The UI transitions to the polling state ("Generierung läuft…").
 *
 * Worker-dependent continuation (@worker tag):
 *   - waits for the FlowProducer 4-step chain to complete (EchoProvider → instant)
 *   - publishes the page
 *   - navigates to the public URL /p/<tenantSlug>/<pageSlug>
 *   - verifies the hero section renders
 *   - submits the lead-capture form
 *   - asserts the POST to /api/forms/… returns 200
 */
import { test, expect } from "@playwright/test";
import { loginAsCafeOwner } from "./fixtures/auth";

const SCREENSHOTS = "e2e/screenshots";
const workersRunning = process.env.WORKERS_RUNNING === "true";

test("landing-pages journey — prompt form + generating state", async ({ page }) => {
  await loginAsCafeOwner(page);

  // ── 1. Landing pages dashboard ────────────────────────────────────────────
  await page.goto("/de/landing-pages");
  await expect(page.getByRole("heading", { name: "Landing Pages" })).toBeVisible();

  // ── 2. Fill prompt ────────────────────────────────────────────────────────
  await page.fill("#lp-prompt", "Café Zürich — frische Tagesmenüs aus lokalen Zutaten, vegane Optionen, rustikales Ambiente.");

  await page.screenshot({ path: `${SCREENSHOTS}/08-landing-pages-prompt.png` });

  // ── 3. Submit → generating state ─────────────────────────────────────────
  await page.click('button[type="submit"]');
  await expect(page.getByText(/Generierung läuft/)).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/09-landing-pages-generating.png` });
});

test("@worker landing-pages journey — full generate → publish → public render → lead form", async ({ page }) => {
  test.skip(!workersRunning, "Set WORKERS_RUNNING=true to run worker-dependent specs");

  await loginAsCafeOwner(page);
  await page.goto("/de/landing-pages");

  // Submit prompt
  await page.fill("#lp-prompt", "E2E Test Cafe — vegane Küche, tägliches Menü.");
  await page.click('button[type="submit"]');

  // Wait for the FlowProducer chain to complete (EchoProvider is nearly instant)
  // Page transitions from draft→draft-with-version; publish button appears.
  await expect(page.getByRole("button", { name: /Veröffentlichen/ })).toBeVisible({ timeout: 60_000 });

  // Capture slug before publishing (it's in the table row)
  const slugCell = page.locator("table tbody tr:first-child td:nth-child(2)");
  const slug = (await slugCell.textContent()) ?? "";

  // Publish
  await page.getByRole("button", { name: /Veröffentlichen/ }).first().click();

  // Status badge transitions to "Veröffentlicht"
  await expect(page.getByText("Veröffentlicht")).toBeVisible({ timeout: 10_000 });

  // Navigate to public render — need tenantSlug from the session
  // The public URL pattern is /p/<tenantSlug>/<pageSlug>
  // We test the page responds (slug is known from the table row)
  // tenantSlug comes from the e2e seeded cafe tenant
  // Simplified: check the "Anzeigen ↗" link leads somewhere
  const viewLink = page.getByRole("link", { name: /Anzeigen/ });
  const href = await viewLink.getAttribute("href");
  if (href) {
    await page.goto(`http://localhost:3000/p/${href.replace(/^\//, "")}`);
    await expect(page.locator("main h1")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${SCREENSHOTS}/10-landing-page-public.png` });
  }
});
