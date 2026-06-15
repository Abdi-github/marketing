import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@marketing/shared", "@marketing/db", "@marketing/ai-router"],

  // Fix: Next.js was picking up a stray package-lock.json above the monorepo
  // root and computing the wrong outputFileTracingRoot.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // @node-rs/argon2 ships a platform-specific native .node addon that neither
  // webpack nor Turbopack can bundle. serverExternalPackages covers both bundlers
  // (Turbopack + webpack) so the package is require()'d at runtime from
  // node_modules instead of being inlined. The webpack-only config.externals.push
  // below is kept for older Next.js versions / non-Turbopack CI builds.
  serverExternalPackages: ["@node-rs/argon2"],

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("@node-rs/argon2");
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
