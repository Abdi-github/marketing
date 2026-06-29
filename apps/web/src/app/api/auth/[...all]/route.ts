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

function logAuthFailureResponse(method: string, req: Request, response: Response) {
  if (response.status < 500) return;

  logger.error(
    {
      method,
      path: new URL(req.url).pathname,
      status: response.status,
      statusText: response.statusText,
    },
    "Better Auth route returned an error response",
  );
}

export async function GET(req: Request) {
  try {
    const response = await handlers.GET(req);
    logAuthFailureResponse("GET", req, response);
    return response;
  } catch (error) {
    logAuthError("GET", req, error);
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const response = await handlers.POST(req);
    logAuthFailureResponse("POST", req, response);
    return response;
  } catch (error) {
    logAuthError("POST", req, error);
    throw error;
  }
}
