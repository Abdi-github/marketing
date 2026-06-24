import { describe, expect, it } from "vitest";
import {
  buildAutoLandingFormDefinition,
  compositionHasLeadCapture,
} from "./landing-page-form-definition";

describe("landing-page-form-definition", () => {
  it("detects lead capture from lead form sections", () => {
    expect(
      compositionHasLeadCapture({
        title: "Test",
        locale: "en",
        sections: [{ type: "lead_form", order: 0, heading: "Contact us" }],
      }),
    ).toBe(true);
  });

  it("detects lead capture from form-first hero variants", () => {
    expect(
      compositionHasLeadCapture({
        title: "Test",
        locale: "en",
        sections: [{ type: "hero", variant: "split-form-right", order: 0, heading: "Book now" }],
      }),
    ).toBe(true);
  });

  it("does not flag non-conversion compositions", () => {
    expect(
      compositionHasLeadCapture({
        title: "Test",
        locale: "en",
        sections: [{ type: "hero", order: 0, heading: "Welcome" }],
      }),
    ).toBe(false);
  });

  it("builds booking-oriented forms for hospitality-style verticals", () => {
    const definition = buildAutoLandingFormDefinition({
      locale: "en",
      vertical: "restaurant",
    });

    expect(definition.kind).toBe("booking");
    expect(definition.submitLabel).toBe("Request booking");
    expect(definition.steps[1]?.fields.some((field) => field.name === "date")).toBe(true);
  });

  it("builds localized quote forms for service pages", () => {
    const definition = buildAutoLandingFormDefinition({
      locale: "fr-CH",
      vertical: "consulting",
    });

    expect(definition.kind).toBe("quote");
    expect(definition.submitLabel).toBe("Demander une offre");
    expect(definition.settings.success_message).toContain("Merci");
  });

  it("builds callback-oriented forms when the page copy asks for a callback", () => {
    const definition = buildAutoLandingFormDefinition({
      locale: "en",
      goal: "lead_capture",
      composition: {
        title: "Request a callback",
        locale: "en",
        sections: [{ type: "lead_form", order: 0, heading: "Request a callback" }],
      },
    });

    expect(definition.kind).toBe("callback");
    expect(definition.submitLabel).toBe("Request a callback");
    expect(definition.steps[0]?.fields.find((field) => field.name === "phone")?.required).toBe(
      true,
    );
    expect(definition.steps[0]?.fields.some((field) => field.name === "email")).toBe(false);
  });

  it("adds phone and preferred channel fields for SMS and WhatsApp capture", () => {
    const definition = buildAutoLandingFormDefinition({
      locale: "en",
      vertical: "restaurant",
      captureChannels: ["sms", "whatsapp"],
    });

    expect(definition.captureChannels).toEqual(["sms", "whatsapp"]);
    expect(definition.steps[0]?.fields.find((field) => field.name === "phone")?.required).toBe(
      true,
    );
    expect(definition.steps[0]?.fields.some((field) => field.name === "email")).toBe(false);
    expect(
      definition.steps[0]?.fields.find((field) => field.name === "preferred_channel"),
    ).toBeTruthy();
  });

  it("supports email-only capture without requiring phone", () => {
    const definition = buildAutoLandingFormDefinition({
      locale: "en",
      vertical: "consulting",
      captureChannels: ["email"],
    });

    expect(definition.captureChannels).toEqual(["email"]);
    expect(definition.steps[0]?.fields.find((field) => field.name === "email")?.required).toBe(
      true,
    );
    expect(definition.steps[0]?.fields.some((field) => field.name === "phone")).toBe(false);
  });
});
