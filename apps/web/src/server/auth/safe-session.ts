import { auth } from "@marketing/auth";
import { logger } from "@marketing/shared";
import { headers } from "next/headers";

type ServerSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getSafeServerSession(context: string): Promise<ServerSession | null> {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (error) {
    logger.warn(
      {
        context,
        err: error instanceof Error ? error.message : String(error),
      },
      "[auth] Failed to resolve server session",
    );
    return null;
  }
}
