import { outbox } from "@marketing/db";
import type { TenantCreatedPayload, UserSignedUpPayload } from "./events";

// tx is any Drizzle transaction — typed structurally to avoid complex generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export async function emitUserSignedUp(
  tx: Tx,
  payload: UserSignedUpPayload,
): Promise<void> {
  await tx.insert(outbox).values({
    tenantId: payload.tenantId,
    type: "user.signed_up",
    payload,
  });
}

export async function emitTenantCreated(
  tx: Tx,
  payload: TenantCreatedPayload,
): Promise<void> {
  await tx.insert(outbox).values({
    tenantId: payload.tenantId,
    type: "tenant.created",
    payload,
  });
}
