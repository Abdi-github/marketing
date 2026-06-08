import { z } from "zod";

// Typed payload for the ai.social_post.generate BullMQ queue.
// Shared between apps/web (producer) and apps/workers (consumer).
export const socialPostJobSchema = z.object({
  tenantId: z.string().uuid(),
  jobId: z.string().uuid(),
  userId: z.string().uuid(),
  businessName: z.string().min(1).max(200),
  vertical: z.string().min(2).max(100),
  city: z.string().max(100).optional(),
  locale: z.string().default("de-CH"),
  topic: z.string().min(3).max(200),
  highlights: z.string().max(500).optional(),
  /** BullMQ-level idempotency key — equals jobId for new jobs. */
  idempotencyKey: z.string(),
  promptId: z.string().default("social-post-v1"),
  promptVersion: z.number().int().positive().default(1),
  /** Per-job hard cost cap in US cents. Default 50¢ (~CHF 0.45). */
  costBudgetCents: z.number().int().positive().default(50),
  // ─── Refinement fields (optional — only present for iterative edits) ──────
  /** The previously generated draft being refined. */
  previousDraft: z.string().max(2000).optional(),
  /** The user's natural-language instruction for how to modify the draft. */
  refinementInstruction: z.string().max(500).optional(),
  /** UUID shared by all posts in a conversation thread. */
  threadId: z.string().uuid().optional(),
  /** jobId of the post being refined (null for the first post in a thread). */
  parentJobId: z.string().uuid().optional(),
});

export type SocialPostJob = z.infer<typeof socialPostJobSchema>;

export const SOCIAL_POST_QUEUE_NAME = "ai.social_post.generate" as const;
