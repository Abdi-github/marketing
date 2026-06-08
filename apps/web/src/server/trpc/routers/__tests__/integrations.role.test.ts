/**
 * Role-boundary tests for integrations tRPC router.
 *
 * These tests exercise the middleware layer only — they never reach the DB.
 * - viewer / editor roles must be rejected with FORBIDDEN on write procedures.
 * - unauthenticated callers must be rejected with UNAUTHORIZED.
 * - admin / owner roles must NOT receive FORBIDDEN (they may fail further in
 *   due to missing env config, but that is a separate concern from RBAC).
 *
 * Cross-tenant connectionId scoping (tenant A cannot act on tenant B's rows)
 * is verified at the DB layer in:
 *   packages/integrations/src/__tests__/adapter-isolation.test.ts
 */

import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { appRouter } from "../index";
import { createCallerFactory } from "../../trpc";
import type { Context } from "../../trpc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);

function makeCtx(role: "owner" | "admin" | "editor" | "viewer"): Context {
  return {
    // Minimal session shape — middleware only checks session !== null.
    session: { user: { id: "u-test-1" }, session: { id: "s-test-1" } } as Context["session"],
    tenantCtx: {
      tenantId: "00000000-0000-0000-0000-000000000001",
      userId: "u-test-1",
      role,
    },
  };
}

const unauthCtx: Context = { session: null, tenantCtx: null };

// ─── connect ─────────────────────────────────────────────────────────────────

describe("integrations.connect — role boundary", () => {
  it("rejects viewer with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("viewer"));
    await expect(
      caller.integrations.connect({ provider: "eversports", apiKey: "key-abc" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects editor with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("editor"));
    await expect(
      caller.integrations.connect({ provider: "lightspeed_ch", apiKey: "key-abc" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not reject admin with FORBIDDEN (reaches procedure body)", async () => {
    const caller = createCaller(makeCtx("admin"));
    const err = await caller.integrations
      .connect({ provider: "gastrofix", apiKey: "key-abc" })
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
  });

  it("does not reject owner with FORBIDDEN (reaches procedure body)", async () => {
    const caller = createCaller(makeCtx("owner"));
    const err = await caller.integrations
      .connect({ provider: "gastrofix", apiKey: "key-abc" })
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
  });
});

// ─── disconnect ───────────────────────────────────────────────────────────────

describe("integrations.disconnect — role boundary", () => {
  const connectionId = "00000000-0000-0000-0000-000000000099";

  it("rejects viewer with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("viewer"));
    await expect(
      caller.integrations.disconnect({ connectionId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects editor with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("editor"));
    await expect(
      caller.integrations.disconnect({ connectionId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not reject admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("admin"));
    const err = await caller.integrations
      .disconnect({ connectionId })
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
  });
});

// ─── sync ─────────────────────────────────────────────────────────────────────

describe("integrations.sync — role boundary", () => {
  const connectionId = "00000000-0000-0000-0000-000000000099";

  it("rejects viewer with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("viewer"));
    await expect(
      caller.integrations.sync({ connectionId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects editor with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("editor"));
    await expect(
      caller.integrations.sync({ connectionId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not reject admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("admin"));
    const err = await caller.integrations
      .sync({ connectionId })
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
  });
});

// ─── list (tenantProcedure — any authenticated tenant member) ────────────────

describe("integrations.list — authentication boundary", () => {
  it("rejects unauthenticated caller with UNAUTHORIZED", async () => {
    const caller = createCaller(unauthCtx);
    await expect(caller.integrations.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("allows viewer (list is read-only, no admin gate)", async () => {
    const caller = createCaller(makeCtx("viewer"));
    // Will fail with DB error (no real DB in unit tests) but NOT with FORBIDDEN.
    const err = await caller.integrations.list().catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});
