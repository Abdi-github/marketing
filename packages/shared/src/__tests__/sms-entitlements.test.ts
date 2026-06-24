import { describe, expect, it } from "vitest";
import { evaluateSmsEntitlement } from "../sms-entitlements";

describe("evaluateSmsEntitlement", () => {
  it("blocks plans without an SMS allowance", () => {
    const result = evaluateSmsEntitlement({
      monthlyLimit: 0,
      monthlyUsed: 0,
      providerConfigured: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("plan_not_included");
    expect(result.upgradeRequired).toBe(true);
  });

  it("blocks tenants that reached the monthly limit", () => {
    const result = evaluateSmsEntitlement({
      monthlyLimit: 50,
      monthlyUsed: 50,
      providerConfigured: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("monthly_limit_reached");
  });

  it("blocks when the platform provider is missing", () => {
    const result = evaluateSmsEntitlement({
      monthlyLimit: 50,
      monthlyUsed: 0,
      providerConfigured: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("provider_missing");
  });

  it("allows the explicit demo tenant even without a plan limit", () => {
    const result = evaluateSmsEntitlement({
      monthlyLimit: 0,
      monthlyUsed: 0,
      providerConfigured: true,
      demoModeAllowed: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("allowed");
  });
});
