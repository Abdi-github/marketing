import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // Testcontainer-backed integration tests can take longer
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
