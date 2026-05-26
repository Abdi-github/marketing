import { z } from "zod";

// Owner module: auth. Consumed by: tenancy (initial setup), ops (analytics).
export const userSignedUpSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  tenantId: z.string().uuid(),
  locale: z.string(),
  occurredAt: z.string().datetime(),
});

export type UserSignedUpPayload = z.infer<typeof userSignedUpSchema>;

// Owner module: auth/tenancy. Consumed by: billing (Stripe customer), ops.
export const tenantCreatedSchema = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  plan: z.string(),
  occurredAt: z.string().datetime(),
});


export type TenantCreatedPayload = z.infer<typeof tenantCreatedSchema>;
