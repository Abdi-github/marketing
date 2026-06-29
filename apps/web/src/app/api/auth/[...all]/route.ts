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

async function logAuthFailureResponse(method: string, req: Request, response: Response) {
  if (response.status < 500) return;

  let body: string | null = null;
  try {
    body = await response.clone().text();
  } catch {
    body = null;
  }

  logger.error(
    {
      method,
      path: new URL(req.url).pathname,
      status: response.status,
      statusText: response.statusText,
      body,
    },
    "Better Auth route returned an error response",
  );
}

export async function GET(req: Request) {
  try {
    const response = await handlers.GET(req);
    await logAuthFailureResponse("GET", req, response);
    return response;
  } catch (error) {
    logAuthError("GET", req, error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const response = await handlers.POST(req);
    await logAuthFailureResponse("POST", req, response);
    return response;
  } catch (error) {
    logAuthError("POST", req, error);
    throw error;
  }
}
