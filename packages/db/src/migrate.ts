import path from "path";
import { fileURLToPath } from "url";

const _dirname = path.dirname(fileURLToPath(import.meta.url));

// Absolute path to the migrations folder — safe to import in tests without
// triggering the singleton DB client in ./client.ts.
export const MIGRATIONS_DIR = path.resolve(_dirname, "../migrations");
