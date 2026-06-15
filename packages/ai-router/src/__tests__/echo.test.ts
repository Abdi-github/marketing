import { describe, it, expect } from "vitest";
import { EchoProvider } from "../providers/echo";

const baseOpts = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  jobId: "00000000-0000-0000-0000-000000000002",
  promptId: "social-post-v1",
  promptVersion: 1,
  costBudgetCents: 50,
};

describe("EchoProvider", () => {
  const provider = new EchoProvider();

  it("implements IAIProvider contract", () => {
    expect(provider.id).toBe("echo");
    expect(provider.model).toBe("echo-1");
  });

  it("echoes the prompt in the response", async () => {
    const result = await provider.complete({ prompt: "Hello, world!" }, baseOpts);
    expect(result.text).toContain("Hello, world!");
    expect(result.provider).toBe("echo");
    expect(result.model).toBe("echo-1");
    expect(result.costUsd).toBe(0);
  });

  it("reports non-zero token counts", async () => {
    const result = await provider.complete({ prompt: "Testing tokens" }, baseOpts);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("reports a non-negative latency", async () => {
    const result = await provider.complete({ prompt: "Latency check" }, baseOpts);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("isHealthy returns true", async () => {
    expect(await provider.isHealthy()).toBe(true);
  });
});
