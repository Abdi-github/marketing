import { describe, expect, it } from "vitest";
import {
  classifySmsKeyword,
  interpolateSmsTemplate,
  isInsideQuietHours,
  matchesSmsTriggerFilter,
} from "../sms-automation";

describe("SMS automation helpers", () => {
  it("matches supported trigger fields", () => {
    expect(
      matchesSmsTriggerFilter(
        {
          leadKind: "booking",
          sourceChannel: "landing_page_form",
          workflowState: "awaiting_confirmation",
          smsConsent: true,
        },
        {
          leadKind: "booking",
          sourceChannel: "landing_page_form",
          requireSmsConsent: true,
        },
      ),
    ).toBe(true);
  });

  it("recognizes overnight quiet hours in Zurich", () => {
    expect(
      isInsideQuietHours({
        date: new Date("2026-06-23T21:00:00.000Z"),
        timezone: "Europe/Zurich",
        start: "20:00",
        end: "08:00",
      }),
    ).toBe(true);
  });

  it("interpolates missing variables safely", () => {
    expect(
      interpolateSmsTemplate("Hello {{first_name}}, {{missing}}", { first_name: "Abdi" }),
    ).toBe("Hello Abdi, ");
  });

  it("classifies opt-out keywords case-insensitively", () => {
    expect(classifySmsKeyword(" stop ")).toBe("stop");
    expect(classifySmsKeyword("START")).toBe("start");
    expect(classifySmsKeyword("help")).toBe("help");
  });
});
