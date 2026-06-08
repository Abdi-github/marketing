import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.test before anything else so DATABASE_URL is set for globalSetup
// and inherited by the webServer child process.
try {
  const envPath = resolve(__dirname, ".env.test");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    const val = raw.replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env.test absent — CI or user has vars set in the shell
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.output",
  timeout: 70_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],

  globalSetup: "./e2e/global-setup.ts",

  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    env: {
      ...process.env,
      // Force echo provider so e2e tests never spend real AI budget.
      AI_PROVIDER_FALLBACK: "echo",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://postgres:postgres@localhost:5432/marketing_test",
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "e2e-test-secret-32-chars-minimum!",
      // Webhook secrets — fixed values so tests can generate valid sigs.
      GASTROFIX_WEBHOOK_SECRET:
        process.env.GASTROFIX_WEBHOOK_SECRET ?? "e2e-gastrofix-secret",
      EVERSPORTS_WEBHOOK_SECRET:
        process.env.EVERSPORTS_WEBHOOK_SECRET ?? "e2e-eversports-secret",
      // 64-char hex — satisfies z.string().length(64) in env schema.
      INTEGRATION_ENCRYPTION_KEY:
        process.env.INTEGRATION_ENCRYPTION_KEY ?? "0".repeat(64),
      // Stripe placeholders — billing page loads; Checkout redirect will fail
      // gracefully (tested up to the redirect, not the Stripe session itself).
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET:
        process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_placeholder",
    },
  },
});
