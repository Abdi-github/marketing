import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@marketing/shared", "@marketing/db", "@marketing/ai-router"],

  // Fix: Next.js was picking up a stray package-lock.json above the monorepo
  // root and computing the wrong outputFileTracingRoot.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  webpack: (config, { isServer }) => {
    if (isServer) {
      // @node-rs/argon2 ships a platform-specific native .node addon that webpack
      // cannot bundle. The import originates from a local workspace package
      // (packages/auth/src/signup.ts), so serverExternalPackages does not catch it —
      // we must add an explicit webpack external so it is require()'d at runtime.
      config.externals.push("@node-rs/argon2");
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
