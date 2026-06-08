/**
 * Journey 5 — Integrations
 *
 * Two-part spec:
 *   A) UI: cafe owner navigates to /de/integrations, verifies the provider cards
 *      render (Gastrofix, Lightspeed CH, Eversports).
 *   B) API: direct POST to the Gastrofix webhook endpoint with a valid HMAC-SHA256
 *      signature — tests the signature verification and idempotency path without
 *      needing a real Gastrofix account.
 *
 * Reuses verifyGastrofixSignature logic (imported inline via crypto so specs
 * don't need a @marketing/integrations import in the browser context).
 */
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { loginAsCafeOwner } from "./fixtures/auth";

const SCREENSHOTS = "e2e/screenshots";

// Must match GASTROFIX_WEBHOOK_SECRET in playwright.config.ts webServer.env
const GASTROFIX_SECRET = process.env.GASTROFIX_WEBHOOK_SECRET ?? "e2e-gastrofix-secret";

function signGastrofix(body: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hex}`;
}

test("integrations UI — provider cards render", async ({ page }) => {
  await loginAsCafeOwner(page);
  await page.goto("/de/integrations");

  // integrations.list tRPC can take 15s+ under concurrent argon2 login load.
  await expect(page.getByText("Gastrofix")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Lightspeed CH")).toBeVisible();
  await expect(page.getByText("Eversports")).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOTS}/11-integrations-providers.png` });
});

test("integrations API — Gastrofix webhook accepts valid signature", async ({ request }) => {
  const payload = JSON.stringify({
    id: `e2e-${Date.now()}`,
    type: "reservation.created",
    locationId: "loc-e2e-001",
    data: { covers: 4, time: "12:00" },
    timestamp: new Date().toISOString(),
  });
  const sig = signGastrofix(payload, GASTROFIX_SECRET);

  const res = await request.post("/api/integrations/gastrofix/webhook", {
    data: payload,
    headers: {
      "Content-Type": "application/json",
      "X-Gastrofix-Signature": sig,
    },
  });
  expect(res.status()).toBe(200);
});

test("integrations API — Gastrofix webhook rejects invalid signature", async ({ request }) => {
  const payload = JSON.stringify({
    id: `e2e-bad-${Date.now()}`,
    type: "reservation.created",
    locationId: "loc-e2e-002",
    data: {},
    timestamp: new Date().toISOString(),
  });

  const res = await request.post("/api/integrations/gastrofix/webhook", {
    data: payload,
    headers: {
      "Content-Type": "application/json",
      "X-Gastrofix-Signature": "sha256=badhex",
    },
  });
  expect(res.status()).toBe(401);
});

test("integrations API — Gastrofix webhook is idempotent", async ({ request }) => {
  const eventId = `e2e-idem-${Date.now()}`;
  const payload = JSON.stringify({
    id: eventId,
    type: "reservation.created",
    locationId: "loc-e2e-003",
    data: {},
    timestamp: new Date().toISOString(),
  });
  const sig = signGastrofix(payload, GASTROFIX_SECRET);

  const headers = {
    "Content-Type": "application/json",
    "X-Gastrofix-Signature": sig,
  };

  // First call — inserted
  const first = await request.post("/api/integrations/gastrofix/webhook", {
    data: payload,
    headers,
  });
  expect(first.status()).toBe(200);

  // Second call — ON CONFLICT DO NOTHING → 200 (replay)
  const second = await request.post("/api/integrations/gastrofix/webhook", {
    data: payload,
    headers,
  });
  expect(second.status()).toBe(200);
});
