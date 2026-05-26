import { atomicSignup, signupInputSchema } from "@marketing/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedProcedure, publicProcedure, router } from "../trpc";

export const authRouter = router({
  // ─── Signup ───────────────────────────────────────────────────────────────
  // Creates user + tenant + owner membership atomically.
  // The caller must then sign in via the Better-Auth /api/auth/sign-in/email
  // endpoint to receive a session cookie.
  signup: publicProcedure
    .input(signupInputSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await atomicSignup(input);
        return { success: true as const, userId: result.userId, tenantId: result.tenantId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Signup failed";
        // Duplicate email → 409
        if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists.",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  // ─── Whoami ───────────────────────────────────────────────────────────────
  // Returns the current session user. Used by the client to check auth state.
  whoami: authedProcedure.query(({ ctx }) => ({
    userId: ctx.session.user.id,
    email: ctx.session.user.email,
    name: ctx.session.user.name,
  })),

  // ─── Active tenant ────────────────────────────────────────────────────────
  // Returns the active TenantContext for the session (null if none).
  activeTenant: authedProcedure.query(({ ctx }) => ctx.tenantCtx),

  // ─── Set active tenant (tenant switcher) ──────────────────────────────────
  setActiveTenant: authedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { setActiveTenant } = await import("@marketing/tenancy");
      const cookieHeader = (ctx.session as unknown as { headers?: Headers })?.headers?.get?.("cookie") ?? "";
      const tokenMatch = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
      const token = tokenMatch?.[1];
      if (!token) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      await setActiveTenant(token, input.tenantId);
      return { success: true };
    }),
});
