import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Integration tests spin up a real Postgres container — allow extra time.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
