import { describe, expect, it } from "vitest";
import { resolveDatabasePoolConfig } from "../pool-config";

describe("resolveDatabasePoolConfig", () => {
  it("uses one short-lived connection per serverless instance", () => {
    expect(resolveDatabasePoolConfig({ isServerless: true })).toEqual({
      max: 1,
      idleTimeoutSeconds: 5,
      maxLifetimeSeconds: 300,
    });
  });

  it("keeps the existing worker and local defaults", () => {
    expect(resolveDatabasePoolConfig({ isServerless: false })).toEqual({
      max: 3,
      idleTimeoutSeconds: 20,
      maxLifetimeSeconds: 1800,
    });
  });

  it("respects an explicit pool limit", () => {
    expect(resolveDatabasePoolConfig({ configuredMax: 2, isServerless: true })).toMatchObject({
      max: 2,
    });
  });
});
