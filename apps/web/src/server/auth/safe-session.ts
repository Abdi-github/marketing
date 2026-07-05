import { auth } from "@marketing/auth";
import { logger } from "@marketing/shared";
import { headers } from "next/headers";

type ServerSession = Awaited<ReturnType<typeof auth.api.getSession>>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getSafeServerSession(context: string): Promise<ServerSession | null> {
  const requestHeaders = await headers();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await auth.api.getSession({ headers: requestHeaders });
    } catch (error) {
      logger.warn(
        {
          attempt,
          context,
          err: error instanceof Error ? error.message : String(error),
        },
        "[auth] Failed to resolve server session",
      );

      if (attempt < 2) {
        await sleep(150);
      }
    }
  }

  return null;
}
