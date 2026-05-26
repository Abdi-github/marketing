import { describe, it, expect } from "vitest";
import { EchoProvider } from "../providers/echo";

describe("EchoProvider", () => {
  const provider = new EchoProvider();

  it("implements IAIProvider contract", () => {
    expect(provider.name).toBe("echo");
    expect(provider.model).toBe("echo-1");
  });

  it("echoes the prompt in the response", async () => {
    const result = await provider.complete({ prompt: "Hello, world!" });
    expect(result.text).toContain("Hello, world!");
    expect(result.provider).toBe("echo");
    expect(result.model).toBe("echo-1");
  });

  it("reports non-zero token counts", async () => {
    const result = await provider.complete({ prompt: "Testing tokens" });
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("reports a non-negative latency", async () => {
    const result = await provider.complete({ prompt: "Latency check" });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("isHealthy returns true", async () => {
    expect(await provider.isHealthy()).toBe(true);
  });
});
