import { auth } from "@marketing/auth";
import { assertRole, buildTenantContext } from "@marketing/tenancy";
import type { TenantContext } from "@marketing/tenancy";
import type { TenantRole } from "@marketing/db";
import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

// ─── Request context ──────────────────────────────────────────────────────────

export type Context = {
  session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  tenantCtx: TenantContext | null;
  requestOrigin: string;
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  const requestOrigin = new URL(opts.req.url).origin;
  const session = await auth.api.getSession({ headers: opts.req.headers });

  if (!session) {
    return { session: null, tenantCtx: null, requestOrigin };
  }

  // Use the token already extracted by Better-Auth rather than re-parsing the cookie.
  const token = (session.session as { token: string }).token;
  const tenantCtx = await buildTenantContext(token);

  return { session, tenantCtx, requestOrigin };
}

// ─── tRPC init ────────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// ─── Authenticated procedure ──────────────────────────────────────────────────

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { ...ctx, session: ctx.session },
  });
});

// ─── Tenant-scoped procedure ──────────────────────────────────────────────────

export const tenantProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!ctx.tenantCtx) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active tenant. Complete signup or switch tenant.",
    });
  }
  return next({
    ctx: { ...ctx, tenantCtx: ctx.tenantCtx },
  });
});

// ─── Role-gated procedure factory ─────────────────────────────────────────────

export function requires(minimum: TenantRole) {
  return tenantProcedure.use(({ ctx, next }) => {
    try {
      assertRole(ctx.tenantCtx, minimum);
    } catch {
      throw new TRPCError({ code: "FORBIDDEN", message: `Requires ${minimum}` });
    }
    return next({ ctx });
  });
}
