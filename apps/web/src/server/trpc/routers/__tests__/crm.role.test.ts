/**
 * CRM destructive actions require admin-level tenant role.
 *
 * These tests verify the middleware boundary only. Admin callers may fail later
 * because the unit test process has no database connection; that is separate
 * from the RBAC guarantee.
 */

import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { appRouter } from "../index";
import { createCallerFactory } from "../../trpc";
import type { Context } from "../../trpc";

const createCaller = createCallerFactory(appRouter);

function makeCtx(role: "owner" | "admin" | "editor" | "viewer"): Context {
  return {
    session: { user: { id: "u-test-crm" }, session: { id: "s-test-crm" } } as Context["session"],
    tenantCtx: {
      tenantId: "00000000-0000-0000-0000-000000000001",
      userId: "u-test-crm",
      role,
    },
  };
}

describe("contacts.bulkDelete - role boundary", () => {
  const contactIds = ["00000000-0000-0000-0000-000000000101"];

  it("rejects viewer with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("viewer"));
    await expect(caller.contacts.bulkDelete({ contactIds })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects editor with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("editor"));
    await expect(caller.contacts.bulkDelete({ contactIds })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not reject admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("admin"));
    const err = await caller.contacts
      .bulkDelete({ contactIds })
      .catch((e: unknown) => e as TRPCError);

    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
  });
});

describe("contacts.merge - role boundary", () => {
  const input = {
    primaryId: "00000000-0000-0000-0000-000000000101",
    mergeId: "00000000-0000-0000-0000-000000000102",
  };

  it("rejects viewer with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("viewer"));
    await expect(caller.contacts.merge(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects editor with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("editor"));
    await expect(caller.contacts.merge(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("does not reject owner with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("owner"));
    const err = await caller.contacts.merge(input).catch((e: unknown) => e as TRPCError);

    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
  });
});
