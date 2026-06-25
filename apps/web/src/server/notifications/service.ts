import {
  db,
  businessProfiles,
  messages,
  notificationPreferences,
  notifications,
} from "@marketing/db";
import { logger, normalizeSmsPhone } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { enqueueSmsSendJob } from "../queues/sms";

type NotificationPriority = "low" | "normal" | "high";

export type CreateTenantNotificationInput = {
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  priority?: NotificationPriority;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  staffSms?: {
    enabled?: boolean;
    text: string;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getSmsBusinessPhone(settings: unknown): string | null {
  const root = asRecord(settings);
  const sms = asRecord(root["sms"]);
  return typeof sms["businessPhone"] === "string" ? sms["businessPhone"] : null;
}

async function getNotificationPreferences(tenantId: string) {
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.tenantId, tenantId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(notificationPreferences)
    .values({ tenantId })
    .onConflictDoNothing({ target: notificationPreferences.tenantId })
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

export async function createTenantNotification(input: CreateTenantNotificationInput) {
  const preferences = await getNotificationPreferences(input.tenantId);
  if (preferences?.inAppEnabled === false) return null;

  const [notification] = await db
    .insert(notifications)
    .values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      priority: input.priority ?? "normal",
      actionUrl: input.actionUrl ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [notifications.tenantId, notifications.idempotencyKey],
    })
    .returning();

  if (notification && input.staffSms?.enabled !== false) {
    await maybeSendStaffSmsAlert({
      tenantId: input.tenantId,
      text: input.staffSms?.text ?? `${input.title}${input.body ? ` ${input.body}` : ""}`,
      notificationId: notification.id,
      preferences,
    }).catch((error) => {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
          tenantId: input.tenantId,
          notificationId: notification.id,
        },
        "[notifications] Failed to enqueue staff SMS alert",
      );
    });
  }

  return notification ?? null;
}

async function maybeSendStaffSmsAlert(input: {
  tenantId: string;
  text: string;
  notificationId: string;
  preferences: Awaited<ReturnType<typeof getNotificationPreferences>>;
}) {
  if (input.preferences?.staffSmsEnabled === false) return;

  const [profile] = await db
    .select({ leadCaptureSettings: businessProfiles.leadCaptureSettings })
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, input.tenantId))
    .limit(1);

  const phone =
    input.preferences?.staffSmsPhone ?? getSmsBusinessPhone(profile?.leadCaptureSettings);
  if (!phone) return;

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeSmsPhone(phone);
  } catch {
    return;
  }

  const body = input.text.length > 320 ? `${input.text.slice(0, 317)}...` : input.text;
  const [existing] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, input.tenantId),
        eq(messages.channel, "sms"),
        eq(messages.messageType, "staff_alert"),
        eq(messages.externalId, `notification:${input.notificationId}`),
      ),
    )
    .limit(1);
  if (existing) return;

  const [message] = await db
    .insert(messages)
    .values({
      tenantId: input.tenantId,
      channel: "sms",
      direction: "outbound",
      fromAddress: "platform",
      toAddress: normalizedPhone,
      body,
      messageType: "staff_alert",
      status: "queued",
      externalId: `notification:${input.notificationId}`,
      meta: {
        purpose: "staff_alert",
        notificationId: input.notificationId,
      },
    })
    .returning({ id: messages.id });

  if (message) {
    await enqueueSmsSendJob({ tenantId: input.tenantId, messageId: message.id });
  }
}
