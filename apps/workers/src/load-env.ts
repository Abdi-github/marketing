import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local from the monorepo root before any module reads process.env.
// Next.js does this automatically; tsx (workers) does not.
// Uses manual parsing for maximum compatibility across Node versions and Windows paths.

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function tryLoad(envPath: string): boolean {
  if (!existsSync(envPath)) return false;
  const vars = parseEnvFile(readFileSync(envPath, "utf-8"));
  let loaded = 0;
  for (const [k, v] of Object.entries(vars)) {
    // Don't overwrite already-set env vars (allows CI to override)
    if (process.env[k] === undefined) {
      process.env[k] = v;
      loaded++;
    }
  }
  console.log(`[load-env] Loaded ${loaded} vars from ${envPath}`);
  return true;
}

// Try monorepo root .env.local — works when running via tsx or built dist.
const candidates = [
  // From src/ dir: apps/workers/src/ → ../../../ = monorepo root
  join(dirname(fileURLToPath(import.meta.url)), "../../../.env.local"),
  // Absolute fallback: resolve from cwd
  resolve(process.cwd(), "../../.env.local"),
  resolve(process.cwd(), ".env.local"),
];

let found = false;
for (const candidate of candidates) {
  if (tryLoad(candidate)) {
    found = true;
    break;
  }
}

if (!found) {
  console.warn("[load-env] No .env.local found — using process.env as-is (CI/prod mode)");
}
