/**
 * Journey 6 — Ops (super_admin)
 *
 * Platform admin opens /de/ops, verifies the tenant table, suspends a tenant,
 * confirms the suspended badge appears, then unsuspends.
 * Also verifies that a non-super_admin user cannot access ops data
 * (tRPC FORBIDDEN error).
 */
import { test, expect } from "@playwright/test";
import { loginAsSuperAdmin, loginAsCafeOwner } from "./fixtures/auth";

const SCREENSHOTS = "e2e/screenshots";

test("ops journey — super_admin sees tenant table", async ({ page }) => {
  await loginAsSuperAdmin(page);
  await page.goto("/de/ops");

  // Table headers — use role to avoid strict-mode violation if a tenant badge
  // also contains "Suspended" (can happen under parallel test execution).
  // Login (~8s) + nav + listTenants under concurrent argon2 load can total ~35s from test start.
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("columnheader", { name: "Plan" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Suspended" })).toBeVisible();

  // At least the seeded tenants should appear
  await expect(page.getByText("Zurich Cafe E2E")).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/12-ops-tenant-table.png` });
});

test("ops journey — suspend and unsuspend a tenant", async ({ page }) => {
  // This test is intentionally sequential: login + listTenants + conditional-unsuspend
  // + suspend + assert + unsuspend + assert = 8 server round-trips.  Under concurrent
  // argon2 load each trip takes 5-10s → total can reach ~80s, well above the 70s
  // global default.  Override here; other tests keep the tighter default.
  test.setTimeout(120_000);
  await loginAsSuperAdmin(page);
  await page.goto("/de/ops");

  // Wait for table to load — allow extra time when server is under compilation load.
  await expect(page.getByText("Zurich Cafe E2E")).toBeVisible({ timeout: 25_000 });

  // Find the row for the cafe tenant
  const cafeRow = page.getByRole("row", { name: /Zurich Cafe E2E/ });

  // If the cafe is already suspended (left by a parallel chromium run), unsuspend
  // it first so we start from a known Active state.
  const alreadySuspended = cafeRow.getByRole("button", { name: /Unsuspend/ });
  if (await alreadySuspended.isVisible({ timeout: 500 })) {
    await alreadySuspended.click();
    // mutate + refetch can take ~8s under server load
    await expect(cafeRow.getByText("Active")).toBeVisible({ timeout: 30_000 });
  }

  const suspendBtn = cafeRow.getByRole("button", { name: /Suspend/ });

  // Suspend button may be temporarily hidden while a parallel browser worker
  // completes its own suspend→unsuspend cycle (~16-22s).  30s gives enough
  // room to wait for the other worker to restore the Active state.
  await expect(suspendBtn).toBeVisible({ timeout: 30_000 });

  // Intercept browser confirm dialog
  page.on("dialog", (dialog) => dialog.accept());
  await suspendBtn.click();

  // suspend mutation (~10s) + fetchTenants refetch (~9s) + Playwright overhead
  // can total ~20s when signup test is concurrently running argon2 hashing.
  await expect(cafeRow.getByText("Suspended")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SCREENSHOTS}/13-ops-suspended.png` });

  // Unsuspend
  const unsuspendBtn = cafeRow.getByRole("button", { name: /Unsuspend/ });
  await unsuspendBtn.click();
  await expect(cafeRow.getByText("Active")).toBeVisible({ timeout: 30_000 });

  await page.screenshot({ path: `${SCREENSHOTS}/14-ops-unsuspended.png` });
});

test("ops journey — non-super_admin is forbidden", async ({ page }) => {
  // Regular cafe owner should not see tenant data
  await loginAsCafeOwner(page);
  await page.goto("/de/ops");

  // The ops page makes tRPC calls that return FORBIDDEN.
  // The page renders an error message.
  await page.waitForLoadState("networkidle");
  const body = await page.textContent("body");
  // Either "Failed to load" error or "Requires super_admin" is shown
  expect(body).toMatch(/Error|Failed|FORBIDDEN|super_admin/i);
});
