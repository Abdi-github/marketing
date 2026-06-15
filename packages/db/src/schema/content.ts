import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ─── ai_usage ─────────────────────────────────────────────────────────────────
// Append-only ledger: one row per completed AI call.
// add-tenant-table: tenant_id NOT NULL + index + RLS in migration.
// Unique on job_id for idempotency (re-processing the same job → conflict → skip).
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_tenant_id_idx").on(t.tenantId),
    uniqueIndex("ai_usage_job_id_unique").on(t.jobId),
  ],
);

// ─── social_post_status enum ──────────────────────────────────────────────────
export const socialPostStatusEnum = pgEnum("social_post_status", [
  "pending",
  "completed",
  "failed",
]);

// ─── social_posts ─────────────────────────────────────────────────────────────
// add-tenant-table: tenant_id NOT NULL + index + RLS in migration.
// Unique on job_id for idempotency (worker retries → upsert, not duplicate).
export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().unique(),
    // Thread model: first post has thread_id = own id; refinements share the thread.
    threadId: uuid("thread_id"),
    parentJobId: uuid("parent_job_id"),
    refinementInstruction: text("refinement_instruction"),
    promptInput: jsonb("prompt_input").notNull(),
    generatedText: text("generated_text"),
    imageUrl: text("image_url"),
    creativePlan: jsonb("creative_plan"),
    creativeTemplate: text("creative_template"),
    creativeAspectRatio: text("creative_aspect_ratio"),
    creativeImageUrl: text("creative_image_url"),
    creativeStorageKey: text("creative_storage_key"),
    creativeStatus: text("creative_status").notNull().default("idle"),
    creativeError: text("creative_error"),
    creativeUpdatedAt: timestamp("creative_updated_at", { withTimezone: true }),
    status: socialPostStatusEnum("status").notNull().default("pending"),
    aiUsageId: uuid("ai_usage_id").references(() => aiUsage.id, {
      onDelete: "set null",
    }),
    // Meta / Facebook + Instagram publish tracking
    metaPostId: text("meta_post_id"),
    igMediaId: text("ig_media_id"),
    publishedToMetaAt: timestamp("published_to_meta_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("social_posts_tenant_id_idx").on(t.tenantId),
    index("social_posts_thread_id_idx").on(t.threadId),
  ],
);

export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
export type SocialPostStatus = (typeof socialPostStatusEnum.enumValues)[number];
