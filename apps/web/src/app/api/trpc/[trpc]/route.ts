import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/trpc/routers";
import { createContext } from "../../../../server/trpc/trpc";

// Explicitly set Vercel function timeout to 30 seconds.
// Without this, Hobby plans default to 10s (too short for DB + Redis round-trips).
export const maxDuration = 30;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
