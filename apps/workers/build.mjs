// Bundles apps/workers into a self-contained ESM file.
// Workspace packages (@marketing/*) are bundled inline.
// Production npm deps stay external and resolve from node_modules at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: ["node22"],
  format: "esm",
  outfile: "dist/index.js",
  // Some bundled CJS deps (bullmq transitive) use `require()` at runtime.
  // This shim makes `require` available in the ESM output.
  banner: {
    js: [
      `import { createRequire } from "module";`,
      `import { fileURLToPath } from "url";`,
      `import { dirname } from "path";`,
      `const require = createRequire(import.meta.url);`,
      `const __filename = fileURLToPath(import.meta.url);`,
      `const __dirname = dirname(__filename);`,
    ].join("\n"),
  },
  external: [
    // Queue — direct runtime deps; stay external so bullmq's IORedis peer is resolved correctly.
    "bullmq",
    "ioredis",
    // Native addons — cannot be bundled.
    "*.node",
  ],
  logLevel: "info",
});
