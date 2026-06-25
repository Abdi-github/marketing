// Minimal tRPC vanilla client — no React context required.
// Use this in "use client" components for straightforward call/response patterns.
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/trpc/routers";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});
