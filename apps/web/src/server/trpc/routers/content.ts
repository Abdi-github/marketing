import {
  socialCreativeJobSchema,
  socialImageJobSchema,
  socialPostJobSchema,
  createAnthropicHaiku,
  type ToolDefinition,
} from "@marketing/ai-router";
import { db } from "@marketing/db";
import { socialPosts, businessProfiles } from "@marketing/db";
import { env } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, eq, asc, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getSocialCreativePublicUrl,
  type SocialCreativeAspectRatio,
  type SocialCreativeTemplate,
} from "../../../lib/social-creative";
import { enqueueSocialCreativeJob } from "../../queues/social-creative";
import { enqueueSocialImageJob } from "../../queues/social-image";
import { enqueueSocialPostJob } from "../../queues/social-post";
import { tenantProcedure, router } from "../trpc";

const SOCIAL_POST_PROMPT: Record<string, string> = {
  "fr-CH": "social-post-fr-v1",
  "it-CH": "social-post-it-v1",
  en: "social-post-en-v1",
};

const REFINE_PROMPT: Record<string, string> = {
  "fr-CH": "social-post-refine-fr-v1",
  "it-CH": "social-post-refine-it-v1",
  en: "social-post-refine-en-v1",
};

function selectPrompt(locale: string, isRefinement: boolean): string {
  if (isRefinement) return REFINE_PROMPT[locale] ?? "social-post-refine-v1";
  return SOCIAL_POST_PROMPT[locale] ?? "social-post-v1";
}

const aiImageAspectRatioSchema = z.enum(["1:1", "4:3", "3:4", "4:5", "16:9", "9:16"]);
const socialCreativeAspectRatioSchema = z.enum(["1:1", "4:5", "9:16"]);
const socialCreativeTemplateSchema = z.enum([
  "auto",
  "promo-badge",
  "editorial-collage",
  "event-poster",
  "story-card",
  "retail-offer",
  "product-hero",
  "testimonial-proof",
  "carousel-cover",
]);

function withCreativeUrl<
  T extends {
    jobId: string;
    creativeImageUrl?: string | null;
    creativePlan?: unknown;
    creativeStatus?: string | null;
    creativeUpdatedAt?: Date | string | null;
  },
>(row: T): T & { creativeUrl: string | null } {
  return {
    ...row,
    creativeUrl:
      (row.creativeImageUrl || row.creativePlan) && row.creativeStatus !== "pending"
        ? getSocialCreativePublicUrl(env.APP_URL, row.jobId, row.creativeUpdatedAt ?? "latest")
        : null,
  };
}

function normalizeCreativeAspectRatio(value: string | null | undefined): SocialCreativeAspectRatio {
  if (value === "1:1" || value === "9:16") return value;
  return "4:5";
}

function normalizeCreativeTemplate(value: string | null | undefined): SocialCreativeTemplate {
  if (
    value === "promo-badge" ||
    value === "editorial-collage" ||
    value === "event-poster" ||
    value === "story-card" ||
    value === "retail-offer" ||
    value === "product-hero" ||
    value === "testimonial-proof" ||
    value === "carousel-cover"
  ) {
    return value;
  }
  return "auto";
}

async function enqueueSocialCreative(input: {
  tenantId: string;
  userId: string;
  postJobId: string;
  aspectRatio: SocialCreativeAspectRatio;
  template: SocialCreativeTemplate;
  creativeDirection?: string | null;
}): Promise<string> {
  const idempotencyKey = crypto.randomUUID();
  const payload = socialCreativeJobSchema.parse({
    tenantId: input.tenantId,
    userId: input.userId,
    postJobId: input.postJobId,
    aspectRatio: input.aspectRatio,
    template: input.template,
    idempotencyKey,
    promptId: "social-creative-plan-v1",
    promptVersion: 1,
    costBudgetCents: 20,
    creativeDirection: input.creativeDirection?.trim() || undefined,
    variantNonce: idempotencyKey.slice(0, 8),
  });

  await enqueueSocialCreativeJob("generate", payload, { jobId: idempotencyKey });
  return idempotencyKey;
}

async function enqueueSocialImage(input: {
  tenantId: string;
  userId: string;
  postJobId: string;
  action: "generate" | "edit";
  prompt: string;
  aspectRatio: z.infer<typeof aiImageAspectRatioSchema>;
  inputImageUrl?: string | null;
}): Promise<string> {
  const idempotencyKey = crypto.randomUUID();
  const payload = socialImageJobSchema.parse({
    tenantId: input.tenantId,
    userId: input.userId,
    postJobId: input.postJobId,
    action: input.action,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    inputImageUrl: input.inputImageUrl ?? undefined,
    idempotencyKey,
    promptId: input.action === "edit" ? "social-post-image-edit-v1" : "social-post-image-v1",
    promptVersion: 1,
    costBudgetCents: 20,
  });

  await enqueueSocialImageJob(input.action, payload, { jobId: idempotencyKey });
  return idempotencyKey;
}

export const contentRouter = router({
  // Enqueue a social post generation job. Returns jobId for polling.
  generateSocialPost: tenantProcedure
    .input(
      z.object({
        topic: z.string().min(3).max(200),
        highlights: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      if (!profile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Complete your business profile before generating posts.",
        });
      }

      const jobId = crypto.randomUUID();

      const payload = socialPostJobSchema.parse({
        tenantId,
        jobId,
        userId,
        businessName: profile.businessName,
        vertical: profile.vertical,
        city: profile.addressCity ?? undefined,
        locale: profile.locale,
        topic: input.topic,
        highlights: input.highlights,
        idempotencyKey: jobId,
        promptId: selectPrompt(profile.locale, false),
        promptVersion: 1,
        costBudgetCents: 50,
        // threadId is set by the worker to jobId (the thread root)
      });

      await enqueueSocialPostJob("generate", payload, { jobId });
      return { jobId };
    }),

  // Enqueue a refinement job for an existing post. Returns new jobId.
  refinePost: tenantProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        parentJobId: z.string().uuid(),
        previousDraft: z.string().min(1).max(2000),
        refinementInstruction: z.string().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      if (!profile) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Business profile not found." });
      }

      // Verify the parent post belongs to this tenant and thread.
      const [parent] = await db
        .select({ topic: socialPosts.promptInput, status: socialPosts.status })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.parentJobId)));

      if (!parent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Parent post not found." });
      }

      // Extract topic from the parent's promptInput JSONB.
      const parentInput = parent.topic as { topic?: string };
      const topic = parentInput?.topic ?? "social media post";

      const jobId = crypto.randomUUID();

      const payload = socialPostJobSchema.parse({
        tenantId,
        jobId,
        userId,
        businessName: profile.businessName,
        vertical: profile.vertical,
        city: profile.addressCity ?? undefined,
        locale: profile.locale,
        topic,
        idempotencyKey: jobId,
        promptId: selectPrompt(profile.locale, true),
        promptVersion: 1,
        costBudgetCents: 50,
        previousDraft: input.previousDraft,
        refinementInstruction: input.refinementInstruction,
        threadId: input.threadId,
        parentJobId: input.parentJobId,
      });

      await enqueueSocialPostJob("generate", payload, { jobId });
      return { jobId };
    }),

  // Poll the status of a social post job.
  jobStatus: tenantProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [post] = await db
        .select({
          id: socialPosts.id,
          jobId: socialPosts.jobId,
          threadId: socialPosts.threadId,
          status: socialPosts.status,
          generatedText: socialPosts.generatedText,
          imageUrl: socialPosts.imageUrl,
          creativePlan: socialPosts.creativePlan,
          creativeTemplate: socialPosts.creativeTemplate,
          creativeAspectRatio: socialPosts.creativeAspectRatio,
          creativeImageUrl: socialPosts.creativeImageUrl,
          creativeStatus: socialPosts.creativeStatus,
          creativeError: socialPosts.creativeError,
          creativeUpdatedAt: socialPosts.creativeUpdatedAt,
          createdAt: socialPosts.createdAt,
          updatedAt: socialPosts.updatedAt,
        })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      return post ? withCreativeUrl(post) : null;
    }),

  // Fetch all posts in a thread (oldest first).
  listThread: tenantProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      return db
        .select({
          jobId: socialPosts.jobId,
          status: socialPosts.status,
          generatedText: socialPosts.generatedText,
          imageUrl: socialPosts.imageUrl,
          creativePlan: socialPosts.creativePlan,
          creativeTemplate: socialPosts.creativeTemplate,
          creativeAspectRatio: socialPosts.creativeAspectRatio,
          creativeImageUrl: socialPosts.creativeImageUrl,
          creativeStatus: socialPosts.creativeStatus,
          creativeError: socialPosts.creativeError,
          creativeUpdatedAt: socialPosts.creativeUpdatedAt,
          refinementInstruction: socialPosts.refinementInstruction,
          promptInput: socialPosts.promptInput,
          createdAt: socialPosts.createdAt,
        })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.threadId, input.threadId)))
        .orderBy(asc(socialPosts.createdAt))
        .then((posts) => posts.map(withCreativeUrl));
    }),

  // Use Claude Haiku to generate a specific image-generation prompt from the post content.
  // Falls back to a template if ANTHROPIC_API_KEY is not set.
  suggestImagePrompt: tenantProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [post] = await db
        .select({ generatedText: socialPosts.generatedText })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      const [profile] = await db
        .select({
          businessName: businessProfiles.businessName,
          vertical: businessProfiles.vertical,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId));

      const postText = post?.generatedText ?? "";
      const vertical = profile?.vertical ?? "";
      const businessName = profile?.businessName ?? "";

      if (env.ANTHROPIC_API_KEY) {
        try {
          const haiku = createAnthropicHaiku();
          const result = await haiku.complete(
            {
              systemPrompt:
                "You are an expert at writing prompts for AI image generation (FLUX, Midjourney). " +
                "Write ONLY the image prompt — no explanation, no preamble. " +
                "Be specific and visual. Use photographic terms. Max 80 words.",
              prompt:
                `Write an image generation prompt for a commercial marketing photo based on this social media post.\n\n` +
                `Business: ${businessName} (${vertical})\n` +
                `Post:\n${postText}\n\n` +
                `Rules:\n` +
                `- Describe what to SHOW (specific food, product, space, scene)\n` +
                `- Say "no people" unless the post is clearly about staff or a person\n` +
                `- Add: photorealistic, warm natural lighting, professional photography, no text overlays`,
              maxTokens: 120,
              temperature: 0.4,
            },
            {
              tenantId,
              jobId: input.jobId,
              promptId: "image-prompt-suggest-v1",
              promptVersion: 1,
              costBudgetCents: 5,
            },
          );
          return { prompt: result.text.trim() };
        } catch {
          // Fall through to template if LLM call fails.
        }
      }

      // Template fallback — still much better than the old generic prompt.
      const snippet = postText.slice(0, 150).replace(/\n/g, " ");
      return {
        prompt:
          `Commercial marketing photo for a ${vertical} business. ` +
          `Visual content: "${snippet}". ` +
          `Focus on the product, food, or space — no generic stock people. ` +
          `Photorealistic, warm natural lighting, professional quality, no text overlays.`,
      };
    }),

  // Route a free-text instruction from the conversational box to the right action.
  // Returns whether the user wants to change the post TEXT or the post IMAGE, and
  // when it's the image, a concrete prompt that honours the user's constraints.
  // This is what makes the bottom chat box understand "give me another image
  // without a laptop" instead of silently refining the text only.
  interpretRefinement: tenantProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        instruction: z.string().min(1).max(500),
        hasImage: z.boolean(),
      }),
    )
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<
        { target: "text" } | { target: "image"; action: "new" | "edit"; imagePrompt: string }
      > => {
        const { tenantId } = ctx.tenantCtx;

        const [post] = await db
          .select({ generatedText: socialPosts.generatedText })
          .from(socialPosts)
          .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

        const [profile] = await db
          .select({
            businessName: businessProfiles.businessName,
            vertical: businessProfiles.vertical,
          })
          .from(businessProfiles)
          .where(eq(businessProfiles.tenantId, tenantId));

        const postText = post?.generatedText ?? "";
        const vertical = profile?.vertical ?? "";
        const businessName = profile?.businessName ?? "";

        if (env.ANTHROPIC_API_KEY) {
          try {
            const haiku = createAnthropicHaiku();
            const result = await haiku.completionWithTools(
              {
                systemPrompt:
                  "You route a user's refinement request for a social media post that has written " +
                  "text and may already have an AI-generated image. " +
                  "If the request is about wording, tone, length, emojis, or call-to-action → target=text. " +
                  "If it's about the picture/photo/visual/illustration → target=image. " +
                  "Always call the classify_refinement tool.",
                prompt:
                  `Business: ${businessName} (${vertical})\n` +
                  `Existing image present: ${input.hasImage ? "yes" : "no"}\n` +
                  `Post text:\n${postText}\n\n` +
                  `User request: "${input.instruction}"\n\n` +
                  `If target=image: pick action 'new' for a different/fresh image (or when none exists), ` +
                  `or 'edit' to modify the current one. Then write image_prompt. For a 'new' marketing ` +
                  `image make it photorealistic with warm natural lighting, professional photography, ` +
                  `no text overlays, and strictly honour everything the user asked to include or avoid ` +
                  `(e.g. if they say no laptop, do not put a laptop in the scene).`,
                maxTokens: 300,
                temperature: 0,
              },
              [REFINE_INTENT_TOOL],
              {
                tenantId,
                jobId: input.jobId,
                promptId: "refine-intent-v1",
                promptVersion: 1,
                costBudgetCents: 5,
              },
            );

            const tr = result.toolResult as {
              target?: string;
              action?: string;
              image_prompt?: string;
            } | null;

            if (tr?.target === "image") {
              const prompt = (tr.image_prompt ?? "").trim();
              const action: "new" | "edit" =
                tr.action === "edit" && input.hasImage ? "edit" : "new";
              if (prompt.length >= 5) return { target: "image", action, imagePrompt: prompt };
              // Model picked image but gave no usable prompt — build one.
              return {
                target: "image",
                action: "new",
                imagePrompt: buildFallbackImagePrompt(vertical, postText, input.instruction),
              };
            }
            if (tr?.target === "text") return { target: "text" };
            // Unusable tool result — fall through to heuristic.
          } catch {
            // Any LLM error → heuristic fallback below.
          }
        }

        return heuristicIntent(input.instruction, input.hasImage, vertical, postText);
      },
    ),

  // Manually edit the post's text in place (no AI call). Lets users fix wording
  // — a typo, a city name — without paying for an AI refinement. Updates the same
  // row, so the editor, the OG card and Meta publishing all stay in sync.
  editPostText: tenantProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        text: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [post] = await db
        .select({
          status: socialPosts.status,
          imageUrl: socialPosts.imageUrl,
          promptInput: socialPosts.promptInput,
          creativePlan: socialPosts.creativePlan,
          creativeTemplate: socialPosts.creativeTemplate,
          creativeAspectRatio: socialPosts.creativeAspectRatio,
          creativeImageUrl: socialPosts.creativeImageUrl,
        })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      if (post.status !== "completed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Post is not yet completed." });

      let creativePatch: Record<string, unknown> = {};
      let creativeUrl: string | null = null;
      let creativeStatus: string | null = null;
      if (post.creativePlan || post.creativeImageUrl) {
        const creativeUpdatedAt = new Date();
        creativeStatus = "pending";
        creativePatch = {
          creativePlan: null,
          creativeImageUrl: null,
          creativeStorageKey: null,
          creativeStatus: "pending",
          creativeError: null,
          creativeUpdatedAt,
        };
        await enqueueSocialCreative({
          tenantId,
          userId,
          postJobId: input.jobId,
          aspectRatio: normalizeCreativeAspectRatio(post.creativeAspectRatio),
          template: normalizeCreativeTemplate(post.creativeTemplate),
        });
      }

      await db
        .update(socialPosts)
        .set({ generatedText: input.text, updatedAt: new Date(), ...creativePatch })
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      return { text: input.text, creativeUrl, creativeStatus };
    }),

  // Create or refresh a designed graphic for a completed post.
  // The worker plans, renders, uploads, and stores the final PNG URL.
  generateSocialCreative: tenantProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        aspectRatio: socialCreativeAspectRatioSchema.default("4:5"),
        template: socialCreativeTemplateSchema.default("auto"),
        creativeDirection: z.string().max(600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [post] = await db
        .select({
          status: socialPosts.status,
          generatedText: socialPosts.generatedText,
        })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      if (post.status !== "completed" || !post.generatedText) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Post is not yet completed." });
      }

      const now = new Date();

      await db
        .update(socialPosts)
        .set({
          creativeTemplate: input.template,
          creativeAspectRatio: input.aspectRatio,
          creativePlan: null,
          creativeImageUrl: null,
          creativeStorageKey: null,
          creativeStatus: "pending",
          creativeError: null,
          creativeUpdatedAt: now,
          updatedAt: now,
        })
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      const creativeJobId = await enqueueSocialCreative({
        tenantId,
        userId,
        postJobId: input.jobId,
        aspectRatio: input.aspectRatio,
        template: input.template,
        creativeDirection: input.creativeDirection,
      });

      return {
        creativeJobId,
        creativeTemplate: input.template,
        creativeAspectRatio: input.aspectRatio,
        creativeStatus: "pending",
        creativeUpdatedAt: now,
        creativeUrl: null,
      };
    }),

  // Generate an AI image for a completed post on demand.
  generatePostImage: tenantProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        imagePrompt: z.string().min(5).max(500),
        aspectRatio: aiImageAspectRatioSchema.default("1:1"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [post] = await db
        .select({ status: socialPosts.status })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      if (post.status !== "completed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Post is not yet completed." });

      const imageJobId = await enqueueSocialImage({
        tenantId,
        userId,
        postJobId: input.jobId,
        action: "generate",
        prompt: input.imagePrompt,
        aspectRatio: input.aspectRatio,
      });

      return { imageJobId, status: "pending" as const, url: null };
    }),

  // Edit an already-generated image using FLUX Kontext (img2img).
  editPostImage: tenantProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        editInstruction: z.string().min(5).max(500),
        aspectRatio: aiImageAspectRatioSchema.default("1:1"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId, userId } = ctx.tenantCtx;

      const [post] = await db
        .select({ status: socialPosts.status, imageUrl: socialPosts.imageUrl })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });
      if (!post.imageUrl)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No image to edit. Generate an image first.",
        });

      const imageJobId = await enqueueSocialImage({
        tenantId,
        userId,
        postJobId: input.jobId,
        action: "edit",
        prompt: input.editInstruction,
        aspectRatio: input.aspectRatio,
        inputImageUrl: post.imageUrl,
      });

      return { imageJobId, status: "pending" as const, url: null };
    }),

  // List social posts for the tenant with server-side pagination and filtering.
  listPosts: tenantProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          filter: z.enum(["all", "draft", "published"]).default("all"),
        })
        .default({ page: 1, filter: "all" }),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const pageSize = 20;
      const offset = (input.page - 1) * pageSize;

      const baseConditions = [
        eq(socialPosts.tenantId, tenantId),
        eq(socialPosts.threadId, socialPosts.jobId),
      ] as Parameters<typeof and>;

      if (input.filter === "published") {
        baseConditions.push(isNotNull(socialPosts.metaPostId));
      } else if (input.filter === "draft") {
        baseConditions.push(isNull(socialPosts.metaPostId));
        baseConditions.push(eq(socialPosts.status, "completed"));
      }

      const whereClause = and(...baseConditions);

      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(socialPosts)
        .where(whereClause);

      const posts = await db
        .select({
          id: socialPosts.id,
          jobId: socialPosts.jobId,
          threadId: socialPosts.threadId,
          status: socialPosts.status,
          generatedText: socialPosts.generatedText,
          imageUrl: socialPosts.imageUrl,
          creativePlan: socialPosts.creativePlan,
          creativeTemplate: socialPosts.creativeTemplate,
          creativeAspectRatio: socialPosts.creativeAspectRatio,
          creativeImageUrl: socialPosts.creativeImageUrl,
          creativeStatus: socialPosts.creativeStatus,
          creativeError: socialPosts.creativeError,
          creativeUpdatedAt: socialPosts.creativeUpdatedAt,
          promptInput: socialPosts.promptInput,
          metaPostId: socialPosts.metaPostId,
          publishedToMetaAt: socialPosts.publishedToMetaAt,
          createdAt: socialPosts.createdAt,
        })
        .from(socialPosts)
        .where(whereClause)
        .orderBy(desc(socialPosts.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        posts: posts.map(withCreativeUrl),
        total: countRow?.total ?? 0,
        page: input.page,
        pageSize,
      };
    }),

  // Hard-delete a post thread (root + all its refinements).
  deletePost: tenantProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const [root] = await db
        .select({ threadId: socialPosts.threadId })
        .from(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.jobId, input.jobId)));

      if (!root) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found." });

      const threadId = root.threadId ?? input.jobId;

      await db
        .delete(socialPosts)
        .where(and(eq(socialPosts.tenantId, tenantId), eq(socialPosts.threadId, threadId)));

      return { deleted: true };
    }),
});

// ─── Refinement intent classification ────────────────────────────────────────

const REFINE_INTENT_TOOL: ToolDefinition = {
  name: "classify_refinement",
  description:
    "Decide whether the user's instruction targets the post TEXT or the post IMAGE, " +
    "and when it targets the image, produce a concrete instruction to act on.",
  inputSchema: {
    type: "object",
    required: ["target"],
    properties: {
      target: {
        type: "string",
        enum: ["text", "image"],
        description:
          "Whether the user wants to change the written post (text) or the picture (image).",
      },
      action: {
        type: "string",
        enum: ["new", "edit"],
        description:
          "Image only. 'new' = generate a brand-new image (use when the user asks for another/different image or none exists). " +
          "'edit' = modify the existing image in place (use when they reference the current picture, e.g. 'remove the X', 'make it brighter').",
      },
      image_prompt: {
        type: "string",
        description:
          "Image only. For action 'new': a complete, vivid image-generation prompt (subject, scene, style) that fully honours the user's constraints. " +
          "For action 'edit': a short, direct edit instruction. Max 80 words.",
      },
    },
  },
};

// Words that signal the user is talking about the picture, not the copy.
const IMAGE_KEYWORDS =
  /\b(image|images|picture|pic|photo|photograph|visual|illustration|graphic|background|colou?r|laptop|scene|render|portrait|landscape|brighter|darker|without|remove|show)\b/i;
// Words that signal a fresh image rather than tweaking the current one.
const NEW_IMAGE_KEYWORDS =
  /\b(another|different|new|fresh|other|instead|regenerate|replace the image)\b/i;
// Words that signal an in-place edit of the existing image.
const EDIT_KEYWORDS =
  /\b(remove|without|change|replace|make it|brighter|darker|add|crop|recolou?r|this image|the image|current)\b/i;

function buildFallbackImagePrompt(vertical: string, postText: string, instruction: string): string {
  const snippet = postText.slice(0, 140).replace(/\n/g, " ").trim();
  return (
    `Commercial marketing photo for a ${vertical || "business"}. ` +
    `${instruction.trim()}. ` +
    (snippet ? `Context: "${snippet}". ` : "") +
    `Photorealistic, warm natural lighting, professional quality, no text overlays.`
  );
}

function heuristicIntent(
  instruction: string,
  hasImage: boolean,
  vertical: string,
  postText: string,
): { target: "text" } | { target: "image"; action: "new" | "edit"; imagePrompt: string } {
  if (!IMAGE_KEYWORDS.test(instruction)) return { target: "text" };

  const wantsNew = !hasImage || NEW_IMAGE_KEYWORDS.test(instruction);
  if (!wantsNew && EDIT_KEYWORDS.test(instruction) && instruction.trim().length >= 5) {
    return { target: "image", action: "edit", imagePrompt: instruction.trim() };
  }
  return {
    target: "image",
    action: "new",
    imagePrompt: buildFallbackImagePrompt(vertical, postText, instruction),
  };
}
