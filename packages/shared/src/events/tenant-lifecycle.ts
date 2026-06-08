import { z } from "zod";

// ─── tenant.first_post_emitted ────────────────────────────────────────────────
// Emitted once per tenant when their first AI social post completes.
// Emit site: social-post worker, inside the completion branch (ADR-0016).
export const tenantFirstPostEmittedPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  firstPostAt: z.string().datetime(), // ISO-8601 UTC
  vertical: z.string(),
  jobId: z.string().uuid(),
});
export type TenantFirstPostEmittedPayload = z.infer<
  typeof tenantFirstPostEmittedPayloadSchema
>;

// ─── tenant.first_paid_at ─────────────────────────────────────────────────────
// Emitted once per tenant when they first activate a paid (non-trial) subscription.
// Emit site: Stripe webhook handler on customer.subscription.created/updated (ADR-0016).
export const tenantFirstPaidAtPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  firstPaidAt: z.string().datetime(), // ISO-8601 UTC
  plan: z.string(), // "starter" | "growth"
  stripeSubscriptionId: z.string(),
});
export type TenantFirstPaidAtPayload = z.infer<
  typeof tenantFirstPaidAtPayloadSchema
>;

// ─── tenant.churned ──────────────────────────────────────────────────────────
// Emitted when a tenant's subscription is canceled (may fire more than once).
// Emit site: Stripe webhook handler on customer.subscription.deleted (ADR-0016).
export const tenantChurnedPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  churnedAt: z.string().datetime(), // ISO-8601 UTC
  planAtChurn: z.string(), // plan the tenant was on before churning
  stripeSubscriptionId: z.string(),
});
export type TenantChurnedPayload = z.infer<typeof tenantChurnedPayloadSchema>;

// ─── Event type constants ─────────────────────────────────────────────────────
export const TENANT_LIFECYCLE_EVENTS = {
  FIRST_POST_EMITTED: "tenant.first_post_emitted",
  FIRST_PAID_AT: "tenant.first_paid_at",
  CHURNED: "tenant.churned",
} as const;
