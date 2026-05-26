import { describe, it, expect } from "vitest";
import { tenants, featureFlags } from "../schema";

describe("db schema", () => {
  it("tenants table has required columns", () => {
    const cols = Object.keys(tenants);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("slug");
    expect(cols).toContain("plan");
    expect(cols).toContain("status");
  });

  it("featureFlags table has required columns", () => {
    const cols = Object.keys(featureFlags);
    expect(cols).toContain("key");
    expect(cols).toContain("enabled");
  });
});
