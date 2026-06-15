import { describe, expect, it } from "vitest";
import { getPrompt } from "../prompts/registry";
import {
  buildSocialCreativePlan,
  extractSocialCreativePlanFromText,
  socialCreativeJobSchema,
  socialCreativePlanSchema,
} from "../queues/social-creative.schema";
import { socialImageJobSchema } from "../queues/social-image.schema";

describe("social-creative-plan-v1", () => {
  it("is registered with version 1", () => {
    const prompt = getPrompt("social-creative-plan-v1");
    expect(prompt.id).toBe("social-creative-plan-v1");
    expect(prompt.version).toBe(1);
    expect(prompt.systemPrompt).toContain("Return ONLY valid JSON");
  });

  it("builds a valid deterministic fallback plan", () => {
    const plan = buildSocialCreativePlan({
      businessName: "Cafe Neuchatel",
      vertical: "cafe",
      city: "Neuchatel",
      topic: "Weekend brunch",
      highlights: "Fresh pastries and local coffee",
      postText: "Join us this weekend for brunch with fresh pastries and local coffee.",
      aspectRatio: "4:5",
      template: "auto",
    });

    expect(socialCreativePlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.aspectRatio).toBe("4:5");
  });

  it("routes tangible discount offers to the retail offer template", () => {
    const plan = buildSocialCreativePlan({
      businessName: "Marche Frais",
      vertical: "retail",
      city: "Neuchatel",
      topic: "20% discount on all vegetables",
      highlights: "Fresh local vegetables this weekend",
      postText: "Enjoy 20% discount on all vegetables this weekend.",
      aspectRatio: "4:5",
      template: "auto",
    });

    expect(plan.template).toBe("retail-offer");
    expect(plan.backgroundStyle).toBe("product-scene");
    expect(plan.visualMotif).toContain("vegetable");
  });

  it("routes review-led posts to the testimonial template", () => {
    const plan = buildSocialCreativePlan({
      businessName: "Studio Care",
      vertical: "service",
      city: "Lausanne",
      topic: "Customer review",
      highlights: "A client testimonial about our service",
      postText: "Our latest customer review made our week.",
      aspectRatio: "1:1",
      template: "auto",
    });

    expect(plan.template).toBe("testimonial-proof");
    expect(plan.backgroundStyle).toBe("typographic");
  });

  it("extracts valid JSON from a fenced model response", () => {
    const plan = extractSocialCreativePlanFromText(`\`\`\`json
{
  "version": 1,
  "template": "promo-badge",
  "aspectRatio": "1:1",
  "headline": "Weekend Offer",
  "subheading": "Fresh pastries and local coffee all weekend.",
  "badge": "Offer",
  "cta": "Visit us",
  "footer": "Cafe Neuchatel",
  "visualCue": "table",
  "tone": "promo"
}
\`\`\``);

    expect(plan?.template).toBe("promo-badge");
    expect(plan?.tone).toBe("promo");
  });

  it("validates the queued job payload", () => {
    const parsed = socialCreativeJobSchema.safeParse({
      tenantId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      postJobId: "00000000-0000-0000-0000-000000000003",
      idempotencyKey: "00000000-0000-0000-0000-000000000004",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.aspectRatio).toBe("4:5");
    expect(parsed.data?.template).toBe("auto");
  });

  it("validates the queued standalone social image payload", () => {
    const parsed = socialImageJobSchema.safeParse({
      tenantId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      postJobId: "00000000-0000-0000-0000-000000000003",
      action: "generate",
      prompt: "A premium fresh vegetable market background, no text",
      idempotencyKey: "00000000-0000-0000-0000-000000000004",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.aspectRatio).toBe("1:1");
  });
});
