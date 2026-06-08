import { describe, it, expect, vi, beforeEach } from "vitest";
import { EchoProvider } from "../providers/echo";
import { ProviderRouter } from "../router";
import type { UsageRecord } from "../router";

const baseOpts = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  jobId: "00000000-0000-0000-0000-000000000002",
  promptId: "social-post-v1",
  promptVersion: 1,
  costBudgetCents: 50,
};

describe("ProviderRouter", () => {
  let usageRecords: UsageRecord[];

  beforeEach(() => {
    usageRecords = [];
  });

  function writeUsage(record: UsageRecord) {
    usageRecords.push(record);
    return Promise.resolve();
  }

  it("routes trial plan — ProviderRouter completes and calls writeUsage", async () => {
    const trial = new EchoProvider();
    const primary = new EchoProvider();
    const fallback = new EchoProvider();
    const router = new ProviderRouter({ trial, primary, fallback });

    const result = await router.route(
      { prompt: "Test trial" },
      baseOpts,
      { tenantPlan: "trial", writeUsage },
    );

    expect(result.text).toContain("Test trial");
    expect(usageRecords).toHaveLength(1);
    expect(usageRecords[0]?.tenantId).toBe(baseOpts.tenantId);
    expect(usageRecords[0]?.promptId).toBe("social-post-v1");
  });

  it("routes growth plan — ProviderRouter completes and calls writeUsage", async () => {
    const trial = new EchoProvider();
    const primary = new EchoProvider();
    const fallback = new EchoProvider();
    const router = new ProviderRouter({ trial, primary, fallback });

    const result = await router.route(
      { prompt: "Test growth" },
      baseOpts,
      { tenantPlan: "growth", writeUsage },
    );

    expect(result.text).toContain("Test growth");
    expect(usageRecords).toHaveLength(1);
  });

  it("falls back when primary is unhealthy", async () => {
    const trial = new EchoProvider();
    const primary = new EchoProvider();
    const fallback = new EchoProvider();
    vi.spyOn(primary, "isHealthy").mockResolvedValue(false);
    const completeSpy = vi.spyOn(fallback, "complete");

    const router = new ProviderRouter({ trial, primary, fallback });
    await router.route(
      { prompt: "Test fallback" },
      baseOpts,
      { tenantPlan: "growth", writeUsage },
    );

    expect(completeSpy).toHaveBeenCalledOnce();
    expect(usageRecords).toHaveLength(1);
  });

  it("writes usage with correct token and cost fields", async () => {
    const trial = new EchoProvider();
    const primary = new EchoProvider();
    const fallback = new EchoProvider();
    const router = new ProviderRouter({ trial, primary, fallback });

    await router.route({ prompt: "Prompt" }, baseOpts, { tenantPlan: "trial", writeUsage });

    const rec = usageRecords[0]!;
    expect(rec.promptId).toBe("social-post-v1");
    expect(rec.promptVersion).toBe(1);
    expect(typeof rec.inputTokens).toBe("number");
    expect(rec.inputTokens).toBeGreaterThan(0);
    expect(typeof rec.costUsd).toBe("number");
    expect(rec.costUsd).toBe(0); // EchoProvider returns 0 cost
  });

  it("throws and propagates when both primary and fallback fail", async () => {
    const trial = new EchoProvider();
    const primary = new EchoProvider();
    const fallback = new EchoProvider();
    vi.spyOn(primary, "complete").mockRejectedValue(new Error("primary down"));
    vi.spyOn(fallback, "complete").mockRejectedValue(new Error("fallback down"));

    const router = new ProviderRouter({ trial, primary, fallback });

    await expect(
      router.route({ prompt: "Test" }, baseOpts, { tenantPlan: "growth", writeUsage }),
    ).rejects.toThrow("fallback down");
  });
});
