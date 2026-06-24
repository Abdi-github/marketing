import { describe, expect, it } from "vitest";
import { LEAD_CAPTURE_PRESETS, resolveLeadCapturePreset } from "../queues/lead-capture-presets";

describe("lead capture presets", () => {
  it("maps reservation pages to booking leads with all conversational channels", () => {
    expect(resolveLeadCapturePreset("reservation")).toEqual({
      preset: "reservation",
      leadKind: "booking",
      captureChannels: ["email", "phone", "sms", "whatsapp"],
    });
  });

  it("keeps newsletter capture email-only", () => {
    expect(resolveLeadCapturePreset("newsletter")).toEqual({
      preset: "newsletter",
      leadKind: "generic",
      captureChannels: ["email"],
    });
  });

  it("falls back to quote capture for unknown or legacy wizard payloads", () => {
    expect(resolveLeadCapturePreset("legacy")).toEqual(LEAD_CAPTURE_PRESETS.quote);
    expect(resolveLeadCapturePreset(undefined)).toEqual(LEAD_CAPTURE_PRESETS.quote);
  });
});
