/**
 * Tests for the retention-metrics ops procedures (step-16 / ADR-0016).
 *
 * Two concerns covered:
 *
 * 1. Auth-gate tests (UNAUTHORIZED) — verifiable without a DB, consistent
 *    with the pattern established in ops.role.test.ts. FORBIDDEN tests
 *    require a real DB (the opsProcedure middleware queries users.platformRole);
 *    those are covered by the existing ops.role.test.ts in the CI integration
 *    test environment.
 *
 * 2. Pure-logic unit tests for computeConversionRate and addDays helpers
 *    (no DB touched; exercisable in CI without testcontainers).
 */

import { describe, expect, it } from "vitest";
import type { TRPCError } from "@trpc/server";
import { appRouter } from "../index";
import { createCallerFactory } from "../../trpc";
import type { Context } from "../../trpc";
import { computeConversionRate, addDays } from "../ops";

// ─── Context helpers ──────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);

const unauthCtx: Context = { session: null, tenantCtx: null };

function makeCtx(platformRole: string | null): Context {
  return {
    session: {
      user: { id: "u-test-metrics", platformRole },
      session: { id: "s-test-metrics" },
    } as Context["session"],
    tenantCtx: null,
  };
}

// ─── Auth gate: getRetentionMetrics ──────────────────────────────────────────
// UNAUTHORIZED is thrown before any DB query, so this works without a real DB.
// FORBIDDEN requires the opsProcedure middleware to query users.platformRole;
// that DB-dependent check is covered by ops.role.test.ts in CI integration.

describe("ops.getRetentionMetrics — auth gate", () => {
  it("rejects unauthenticated caller with UNAUTHORIZED", async () => {
    const caller = createCaller(unauthCtx);
    await expect(caller.ops.getRetentionMetrics()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("does NOT reject super_admin with FORBIDDEN (reaches procedure body)", async () => {
    const caller = createCaller(makeCtx("super_admin"));
    const err = await caller.ops
      .getRetentionMetrics()
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});

// ─── Auth gate: backfillMetrics ──────────────────────────────────────────────

describe("ops.backfillMetrics — auth gate", () => {
  it("rejects unauthenticated caller with UNAUTHORIZED", async () => {
    const caller = createCaller(unauthCtx);
    await expect(caller.ops.backfillMetrics()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("does NOT reject super_admin with FORBIDDEN", async () => {
    const caller = createCaller(makeCtx("super_admin"));
    const err = await caller.ops
      .backfillMetrics()
      .catch((e: unknown) => e as TRPCError);
    expect((err as TRPCError).code).not.toBe("FORBIDDEN");
    expect((err as TRPCError).code).not.toBe("UNAUTHORIZED");
  });
});

// ─── computeConversionRate — pure logic unit tests (ADR-0016 §D1) ────────────

describe("computeConversionRate", () => {
  // Fixed "now" so tests don't drift with real clock.
  const NOW = new Date("2026-06-01T12:00:00Z");
  const EIGHT_DAYS_AGO = new Date("2026-05-24T12:00:00Z");
  const THREE_DAYS_AGO = new Date("2026-05-29T12:00:00Z");

  it("returns 0% when no tenants are eligible (all too new)", () => {
    const result = computeConversionRate(
      [
        { trialStartAt: THREE_DAYS_AGO, firstPaidAt: null },
        { trialStartAt: THREE_DAYS_AGO, firstPaidAt: new Date() },
      ],
      NOW,
    );
    expect(result.eligibleCount).toBe(0);
    expect(result.convertedCount).toBe(0);
    expect(result.conversionRate).toBe(0);
  });

  it("returns 0% when all eligible tenants are unconverted", () => {
    const result = computeConversionRate(
      [
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: null },
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: null },
      ],
      NOW,
    );
    expect(result.eligibleCount).toBe(2);
    expect(result.convertedCount).toBe(0);
    expect(result.conversionRate).toBe(0);
  });

  it("returns 100% when all eligible tenants converted", () => {
    const result = computeConversionRate(
      [
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: EIGHT_DAYS_AGO },
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: EIGHT_DAYS_AGO },
      ],
      NOW,
    );
    expect(result.eligibleCount).toBe(2);
    expect(result.convertedCount).toBe(2);
    expect(result.conversionRate).toBe(100);
  });

  it("computes 50% when half of eligible tenants converted", () => {
    const result = computeConversionRate(
      [
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: EIGHT_DAYS_AGO },
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: null },
      ],
      NOW,
    );
    expect(result.eligibleCount).toBe(2);
    expect(result.convertedCount).toBe(1);
    expect(result.conversionRate).toBe(50);
  });

  it("excludes tenants whose trial started < 7 days ago from denominator", () => {
    const result = computeConversionRate(
      [
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: EIGHT_DAYS_AGO }, // eligible + converted
        { trialStartAt: THREE_DAYS_AGO, firstPaidAt: new Date() },     // too new — excluded
      ],
      NOW,
    );
    expect(result.eligibleCount).toBe(1);
    expect(result.convertedCount).toBe(1);
    expect(result.conversionRate).toBe(100);
  });

  it("rounds to nearest integer (67% not 66.666...)", () => {
    const result = computeConversionRate(
      [
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: EIGHT_DAYS_AGO },
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: EIGHT_DAYS_AGO },
        { trialStartAt: EIGHT_DAYS_AGO, firstPaidAt: null },
      ],
      NOW,
    );
    expect(result.conversionRate).toBe(67); // Math.round(2/3 * 100)
  });

  it("handles empty partner list gracefully", () => {
    const result = computeConversionRate([], NOW);
    expect(result.eligibleCount).toBe(0);
    expect(result.conversionRate).toBe(0);
  });
});

// ─── addDays — date arithmetic (ADR-0016 §D1 exact-day retention) ────────────

describe("addDays", () => {
  it("adds N days in UTC, returns YYYY-MM-DD string", () => {
    const base = new Date("2026-05-01T00:00:00Z");
    expect(addDays(base, 7)).toBe("2026-05-08");
    expect(addDays(base, 30)).toBe("2026-05-31");
    expect(addDays(base, 60)).toBe("2026-06-30");
  });

  it("handles month boundaries correctly", () => {
    const base = new Date("2026-01-28T00:00:00Z");
    expect(addDays(base, 7)).toBe("2026-02-04");
  });

  it("does not mutate the input date", () => {
    const base = new Date("2026-05-01T00:00:00Z");
    const before = base.toISOString();
    addDays(base, 30);
    expect(base.toISOString()).toBe(before);
  });
});
