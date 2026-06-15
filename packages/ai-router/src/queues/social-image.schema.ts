import { z } from "zod";

export const socialImageActionSchema = z.enum(["generate", "edit"]);
export const socialImageAspectRatioSchema = z.enum(["1:1", "4:3", "3:4", "4:5", "16:9", "9:16"]);

export const socialImageJobSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  postJobId: z.string().uuid(),
  action: socialImageActionSchema,
  prompt: z.string().min(5).max(500),
  aspectRatio: socialImageAspectRatioSchema.default("1:1"),
  inputImageUrl: z.string().url().optional(),
  idempotencyKey: z.string().uuid(),
  promptId: z.string().default("social-post-image-v1"),
  promptVersion: z.number().int().positive().default(1),
  costBudgetCents: z.number().int().positive().default(20),
  deadline: z.string().datetime().optional(),
});

export type SocialImageAction = z.infer<typeof socialImageActionSchema>;
export type SocialImageAspectRatio = z.infer<typeof socialImageAspectRatioSchema>;
export type SocialImageJob = z.infer<typeof socialImageJobSchema>;

export const SOCIAL_IMAGE_QUEUE_NAME = "ai.social_image.generate" as const;
