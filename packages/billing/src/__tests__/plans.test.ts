import { describe, it, expect } from "vitest";
import { getPlanCaps, monthlyBudgetKey, PLAN_CAPS } from "../plans";

describe("getPlanCaps", () => {
  it("returns trial caps for 'trial'", () => {
    const caps = getPlanCaps("trial");
    expect(caps.monthlyAiBudgetUsd).toBe(1.0);
    expect(caps.monthlySmsLimit).toBe(0);
    expect(caps.perJobBudgetCents).toBe(50);
  });

  it("returns starter caps for 'starter'", () => {
    const caps = getPlanCaps("starter");
    expect(caps.monthlyAiBudgetUsd).toBe(10.0);
    expect(caps.monthlySmsLimit).toBe(50);
    expect(caps.perJobBudgetCents).toBe(50);
  });

  it("returns growth caps for 'growth'", () => {
    const caps = getPlanCaps("growth");
    expect(caps.monthlyAiBudgetUsd).toBe(40.0);
    expect(caps.monthlySmsLimit).toBe(500);
    expect(caps.perJobBudgetCents).toBe(50);
  });

  it("defaults to trial for unknown plan strings", () => {
    const caps = getPlanCaps("enterprise_unknown");
    expect(caps.monthlyAiBudgetUsd).toBe(PLAN_CAPS.trial.monthlyAiBudgetUsd);
  });
});

describe("monthlyBudgetKey", () => {
  it("returns a key containing tenantId and YYYY-MM", () => {
    const key = monthlyBudgetKey("abc-123", new Date("2026-05-15T12:00:00Z"));
    expect(key).toBe("budget:monthly:abc-123:2026-05");
  });

  it("uses UTC month, not local month", () => {
    // Jan 1 at 00:30 UTC is still December 31 in UTC-1.
    const key = monthlyBudgetKey("t1", new Date("2026-01-01T00:00:00Z"));
    expect(key).toBe("budget:monthly:t1:2026-01");
  });
});
