/**
 * Role-boundary tests for the ops tRPC router.
 *
 * Ops procedures are gated to platformRole === "super_admin" (ADR-0014 D3).
 * These tests verify the middleware layer only — no DB is hit.
 *
 * - Users without super_admin platform role must be rejected with FORBIDDEN.
 * - Unauthenticated callers must be rejected with UNAUTHORIZED.
 * - super_admin callers must NOT receive FORBIDDEN (they may fail further
 *   in due to missing DB, but that is separate from the auth gate).
 */

import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { appRouter } from "../index";
import { createCallerFactory } from "../../trpc";
import type { Context } from "../../trpc";

// ─── Context helpers ──────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);

function makeCtx(platformRole: string | null): Context {
  return {
    session: {
      user: { id: "u-test-op", platformRole },
      session: { id: "s-test-op" },
    } as Context["session"],
    tenantCtx: null,
    requestOrigin: "http://localhost:3000",
  };
}

const unauthCtx: Context = {
  session: null,
  tenantCtx: null,
  requestOrigin: "http://localhost:3000",
};

// ─── listTenants ──────────────────────────────────────────────────────────────

describe("ops.listTenants — platform role boundary", () => {
  it("rejects unauthenticated caller with UNAUTHORIZED", async () => {
    const caller = createCaller(unauthCtx);
    await expect(caller.ops.listTenants()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a regular user (no platformRole) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.ops.listTenants()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a tenant admin (platformRole=null) with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("admin"));
    await expect(caller.ops.listTenants()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does NOT reject super_admin with FORBIDDEN (reaches procedure body)", async () => {
    const caller = createCaller(makeCtx("super_admin"));
    const err = await caller.ops.listTenants().catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});

// ─── suspendTenant ────────────────────────────────────────────────────────────

describe("ops.suspendTenant — platform role boundary", () => {
  const tenantId = "cccccccc-0000-0000-0000-000000000001";

  it("rejects unauthenticated caller with UNAUTHORIZED", async () => {
    const caller = createCaller(unauthCtx);
    await expect(caller.ops.suspendTenant({ tenantId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a regular user with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.ops.suspendTenant({ tenantId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does NOT reject super_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("super_admin"));
    const err = await caller.ops.suspendTenant({ tenantId }).catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});

// ─── unsuspendTenant ──────────────────────────────────────────────────────────

describe("ops.unsuspendTenant — platform role boundary", () => {
  const tenantId = "cccccccc-0000-0000-0000-000000000001";

  it("rejects a regular user with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.ops.unsuspendTenant({ tenantId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does NOT reject super_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("super_admin"));
    const err = await caller.ops
      .unsuspendTenant({ tenantId })
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});

// ─── getTenantUsage ───────────────────────────────────────────────────────────

describe("ops.getTenantUsage — platform role boundary", () => {
  const tenantId = "cccccccc-0000-0000-0000-000000000001";

  it("rejects a regular user with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx(null));
    await expect(caller.ops.getTenantUsage({ tenantId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does NOT reject super_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("super_admin"));
    const err = await caller.ops.getTenantUsage({ tenantId }).catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});
