#!/usr/bin/env tsx
// Capture screenshots for all active landing page templates and store them as
// static files in public/template-screenshots/.
//
// Run with:
//   pnpm --filter @marketing/web exec tsx scripts/generate-template-screenshots.ts
//
// Prerequisites:
//   1. Dev server must be running on APP_URL (default: http://localhost:3000)
//   2. DATABASE_URL env var must be set
//
// What it does:
//   - Queries all active templates from the DB
//   - For each template × availableLocale, navigates to /p/preview-card/<key>/<locale>
//   - Takes a 1280×960 screenshot and saves to public/template-screenshots/<key>-<locale>.png
//   - Updates screenshotUrlsByLocale in the DB so the gallery card can use <img> immediately

import { chromium } from "@playwright/test";
import postgres from "postgres";
import * as fs from "node:fs";
import * as path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL env var required");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve(import.meta.dirname, "../public/template-screenshots");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const sql = postgres(DATABASE_URL, { max: 2 });

type Template = {
  id: string;
  key: string;
  available_locales: string[];
  screenshot_urls_by_locale: Record<string, { phone?: string; tablet?: string; desktop?: string }>;
};

async function main() {
  console.log("Fetching active templates from DB…");
  const templates = await sql<Template[]>`
    SELECT id, key, available_locales, screenshot_urls_by_locale
    FROM landing_page_templates
    WHERE is_active = true
    ORDER BY key
  `;

  if (templates.length === 0) {
    console.log("No active templates found. Run the template seeder first.");
    await sql.end();
    return;
  }

  console.log(`Found ${templates.length} templates. Starting browser…`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 1,
  });

  let captured = 0;
  let skipped = 0;

  for (const tpl of templates) {
    const locales = tpl.available_locales.length > 0 ? tpl.available_locales : ["de-CH"];

    const updatedByLocale = { ...(tpl.screenshot_urls_by_locale ?? {}) };

    for (const locale of locales) {
      const filename = `${tpl.key}-${locale.replace("/", "-")}.png`;
      const outPath = path.join(OUT_DIR, filename);
      const publicPath = `/template-screenshots/${filename}`;

      // Skip if already captured (avoid re-work on re-runs)
      if (fs.existsSync(outPath)) {
        console.log(`  ⏭  ${filename} (already exists)`);
        updatedByLocale[locale] = { ...updatedByLocale[locale], desktop: publicPath };
        skipped++;
        continue;
      }

      const url = `${APP_URL}/p/preview-card/${tpl.key}/${locale}`;
      console.log(`  📸 ${url}`);

      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
        // Wait for fonts and images to settle
        await page.waitForTimeout(800);
        await page.screenshot({ path: outPath, type: "png", fullPage: false });
        await page.close();

        updatedByLocale[locale] = { ...updatedByLocale[locale], desktop: publicPath };
        captured++;
        console.log(`     ✓ saved to ${publicPath}`);
      } catch (err) {
        console.error(`     ✗ failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Persist updated screenshot_urls_by_locale to the DB
    await sql`
      UPDATE landing_page_templates
      SET screenshot_urls_by_locale = ${sql.json(updatedByLocale)}
      WHERE id = ${tpl.id}
    `;
  }

  await browser.close();
  await sql.end();

  console.log(`\nDone. Captured: ${captured}, Skipped (already existed): ${skipped}`);
  console.log(`Screenshots saved to: ${OUT_DIR}`);
  console.log("The gallery will now show <img> previews — no iframes needed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
