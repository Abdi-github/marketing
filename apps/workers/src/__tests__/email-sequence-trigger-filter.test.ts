import { describe, expect, it } from "vitest";
import { matchesTriggerFilter } from "../queues/email-sequence-tick/filters";

describe("email sequence trigger filters", () => {
  it("matches lead intent and source filters", () => {
    expect(
      matchesTriggerFilter(
        "lead.captured",
        {
          leadKind: "booking",
          sourceChannel: "landing_page_form",
          formId: "00000000-0000-4000-8000-000000000001",
          marketingConsent: true,
        },
        {
          leadKind: "booking",
          sourceChannel: "landing_page_form",
          formId: "00000000-0000-4000-8000-000000000001",
          requireMarketingConsent: true,
        },
      ),
    ).toBe(true);
  });

  it("rejects the wrong lead intent", () => {
    expect(
      matchesTriggerFilter(
        "lead.captured",
        { leadKind: "quote", sourceChannel: "form", marketingConsent: true },
        { leadKind: "booking" },
      ),
    ).toBe(false);
  });

  it("does not require marketing consent unless configured", () => {
    expect(
      matchesTriggerFilter("lead.captured", { leadKind: "booking" }, { leadKind: "booking" }),
    ).toBe(true);
    expect(
      matchesTriggerFilter(
        "lead.captured",
        { leadKind: "booking", marketingConsent: false },
        { leadKind: "booking", requireMarketingConsent: true },
      ),
    ).toBe(false);
  });
});
