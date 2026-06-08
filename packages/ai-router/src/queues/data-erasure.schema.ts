import { z } from "zod";

// Typed payload for the tenant.data_erasure BullMQ queue.
// Low-priority job — FADP Art. 17 hard-delete; runs outside the HTTP request.
export const dataErasureJobSchema = z.object({
  tenantId: z.string().uuid(),
  requestedBy: z.string().uuid(),
});

export type DataErasureJob = z.infer<typeof dataErasureJobSchema>;

export const DATA_ERASURE_QUEUE_NAME = "tenant.data_erasure" as const;
