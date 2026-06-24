import { z } from "zod";

export const reservationStatusChangedV1 = z.object({
  leadId: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  leadKind: z.string().nullable(),
  workflowState: z.enum(["contacted", "confirmed", "declined", "cancelled"]),
  status: z.enum(["new", "contacted", "confirmed", "qualified", "archived"]),
});

export type ReservationStatusChanged = z.infer<typeof reservationStatusChangedV1>;
