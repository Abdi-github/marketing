import { db, notificationPreferences, notifications } from "@marketing/db";
import { logger, normalizeSmsPhone } from "@marketing/shared";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requires, router, tenantProcedure } from "../trpc";

export const notificationsRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
        includeDismissed: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters = [eq(notifications.tenantId, ctx.tenantCtx.tenantId)];
      if (!input.includeDismissed) filters.push(isNull(notifications.dismissedAt));

      return db
        .select()
        .from(notifications)
        .where(and(...filters))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  unreadCount: tenantProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, ctx.tenantCtx.tenantId),
          eq(notifications.status, "unread"),
          isNull(notifications.dismissedAt),
        ),
      );
    return { total: row?.total ?? 0 };
  }),

  markRead: tenantProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(notifications)
        .set({ status: "read", readAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(notifications.tenantId, ctx.tenantCtx.tenantId),
            eq(notifications.id, input.notificationId),
          ),
        )
        .returning({ id: notifications.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." });
      logger.info(
        { tenantId: ctx.tenantCtx.tenantId, notificationId: input.notificationId },
        "[notifications] marked read",
      );
      return { ok: true };
    }),

  dismiss: tenantProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(notifications)
        .set({
          status: "dismissed",
          dismissedAt: new Date(),
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.tenantId, ctx.tenantCtx.tenantId),
            eq(notifications.id, input.notificationId),
          ),
        )
        .returning({ id: notifications.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." });
      logger.info(
        { tenantId: ctx.tenantCtx.tenantId, notificationId: input.notificationId },
        "[notifications] dismissed",
      );
      return { ok: true };
    }),

  getPreferences: tenantProcedure.query(async ({ ctx }) => {
    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.tenantId, ctx.tenantCtx.tenantId))
      .limit(1);
    if (existing) return existing;
    const [created] = await db
      .insert(notificationPreferences)
      .values({ tenantId: ctx.tenantCtx.tenantId })
      .onConflictDoNothing({ target: notificationPreferences.tenantId })
      .returning();
    return created ?? null;
  }),

  updatePreferences: requires("admin")
    .input(
      z.object({
        inAppEnabled: z.boolean(),
        staffSmsEnabled: z.boolean(),
        staffSmsPhone: z.string().trim().max(30).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const staffSmsPhone = input.staffSmsPhone ? normalizeSmsPhone(input.staffSmsPhone) : null;
      await db
        .insert(notificationPreferences)
        .values({
          tenantId: ctx.tenantCtx.tenantId,
          inAppEnabled: input.inAppEnabled,
          staffSmsEnabled: input.staffSmsEnabled,
          staffSmsPhone,
        })
        .onConflictDoUpdate({
          target: notificationPreferences.tenantId,
          set: {
            inAppEnabled: input.inAppEnabled,
            staffSmsEnabled: input.staffSmsEnabled,
            staffSmsPhone,
            updatedAt: new Date(),
          },
        });
      logger.info({ tenantId: ctx.tenantCtx.tenantId }, "[notifications] preferences updated");
      return { ok: true };
    }),
});
