import { describe, expect, it } from "vitest";
import { pickBundleForVertical } from "./unsplash-bundles";

describe("pickBundleForVertical", () => {
  it("uses creative studio imagery for modern agency and SaaS planning vocabulary", () => {
    expect(pickBundleForVertical("agency-digital portfolio-proof web design").key).toBe(
      "service-creative-studio",
    );
    expect(pickBundleForVertical("software-saas startup product website").key).toBe(
      "service-creative-studio",
    );
  });

  it("uses venue and professional-service imagery for newer subverticals", () => {
    expect(pickBundleForVertical("event-venue wedding venue private dining").key).toBe(
      "restaurant-fine-dining",
    );
    expect(pickBundleForVertical("real-estate-luxury property showcase broker").key).toBe(
      "service-consulting-pro",
    );
    expect(pickBundleForVertical("local-trades quote-service electrician").key).toBe(
      "service-consulting-pro",
    );
  });
});
