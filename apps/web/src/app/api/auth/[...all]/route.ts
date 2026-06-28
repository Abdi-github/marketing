import { auth } from "@marketing/auth";
import { logger } from "@marketing/shared";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

function logAuthError(method: string, req: Request, error: unknown) {
  logger.error(
    {
      err: error,
      method,
      path: new URL(req.url).pathname,
    },
    "Better Auth route failed",
  );
}

export async function GET(req: Request) {
  try {
    return await handlers.GET(req);
  } catch (error) {
    logAuthError("GET", req, error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    return await handlers.POST(req);
  } catch (error) {
    logAuthError("POST", req, error);
    throw error;
  }
}
