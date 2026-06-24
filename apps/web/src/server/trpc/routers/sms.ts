import { createHash, randomInt } from "node:crypto";
import { getPlanCaps, smsUsageMonthStart } from "@marketing/billing";
import {
  businessProfiles,
  db,
  messages,
  smsPhoneVerifications,
  tenants,
  usageRecords,
} from "@marketing/db";
import {
  getSmsProviderHealth,
  isSmsTestModeTenant,
  resolveSmsCredentials,
} from "@marketing/integrations";
import { env, evaluateSmsEntitlement, normalizeSmsPhone } from "@marketing/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { enqueueSmsSendJob } from "../../queues/sms";
import { requires, router, tenantProcedure } from "../trpc";

function hashVerificationCode(tenantId: string, phone: string, code: string): string {
  return createHash("sha256")
    .update(`${tenantId}:${phone}:${code}:${env.BETTER_AUTH_SECRET}`)
    .digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

function leadSettingsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function smsSettingsRecord(value: unknown): Record<string, unknown> {
  const settings = leadSettingsRecord(value);
  return leadSettingsRecord(settings["sms"]);
}

async function getTenantSmsEntitlement(tenantId: string) {
  const [[tenant], [monthlyUsage]] = await Promise.all([
    db
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select({ total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int` })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenantId, tenantId),
          eq(usageRecords.metric, "sms_sent"),
          gte(usageRecords.recordedAt, smsUsageMonthStart()),
        ),
      ),
  ]);
  if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
  const demoModeAllowed = isSmsTestModeTenant(env, tenant.slug);
  const entitlement = evaluateSmsEntitlement({
    monthlyLimit: getPlanCaps(tenant.plan).monthlySmsLimit,
    monthlyUsed: Number(monthlyUsage?.total ?? 0),
    providerConfigured: getSmsProviderHealth(env).configured,
    demoModeAllowed,
  });
  return { tenant, entitlement, demoModeAllowed };
}

export const smsRouter = router({
  getBusinessSmsSettings: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const [{ tenant, entitlement, demoModeAllowed }, [profile], [verification]] = await Promise.all(
      [
        getTenantSmsEntitlement(tenantId),
        db
          .select({ leadCaptureSettings: businessProfiles.leadCaptureSettings })
          .from(businessProfiles)
          .where(eq(businessProfiles.tenantId, tenantId))
          .limit(1),
        db
          .select({
            phone: smsPhoneVerifications.phone,
            status: smsPhoneVerifications.status,
            verifiedAt: smsPhoneVerifications.verifiedAt,
            expiresAt: smsPhoneVerifications.expiresAt,
          })
          .from(smsPhoneVerifications)
          .where(eq(smsPhoneVerifications.tenantId, tenantId))
          .orderBy(desc(smsPhoneVerifications.createdAt))
          .limit(1),
      ],
    );
    const settings = smsSettingsRecord(profile?.leadCaptureSettings);
    return {
      plan: tenant.plan,
      demoModeAllowed,
      entitlement,
      enabled: settings["enabled"] !== false,
      preferredChannel:
        typeof settings["preferredChannel"] === "string" ? settings["preferredChannel"] : "sms",
      confirmationWording:
        typeof settings["confirmationWording"] === "string"
          ? settings["confirmationWording"]
          : "Thanks for your request. We will confirm shortly.",
      businessPhone:
        verification?.status === "verified"
          ? verification.phone
          : typeof settings["businessPhone"] === "string"
            ? settings["businessPhone"]
            : null,
      phoneVerificationStatus: verification?.status ?? "not_started",
      phoneVerifiedAt: verification?.verifiedAt ?? null,
      phoneVerificationExpiresAt: verification?.expiresAt ?? null,
    };
  }),

  updateBusinessSmsSettings: requires("admin")
    .input(
      z.object({
        enabled: z.boolean().optional(),
        preferredChannel: z.enum(["sms", "phone", "email"]).optional(),
        confirmationWording: z.string().min(3).max(240).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [profile] = await db
        .select({
          id: businessProfiles.id,
          leadCaptureSettings: businessProfiles.leadCaptureSettings,
        })
        .from(businessProfiles)
        .where(eq(businessProfiles.tenantId, tenantId))
        .limit(1);
      if (!profile)
        throw new TRPCError({ code: "NOT_FOUND", message: "Business profile not found." });
      const existing = leadSettingsRecord(profile.leadCaptureSettings);
      const currentSms = smsSettingsRecord(profile.leadCaptureSettings);
      const sms = {
        ...currentSms,
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.preferredChannel ? { preferredChannel: input.preferredChannel } : {}),
        ...(input.confirmationWording
          ? { confirmationWording: input.confirmationWording.trim() }
          : {}),
      };
      await db
        .update(businessProfiles)
        .set({ leadCaptureSettings: { ...existing, sms }, updatedAt: new Date() })
        .where(eq(businessProfiles.id, profile.id));
      return { ok: true };
    }),

  startBusinessPhoneVerification: requires("admin")
    .input(z.object({ phone: z.string().min(7).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const { tenant, entitlement } = await getTenantSmsEntitlement(tenantId);
      if (!entitlement.allowed) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            entitlement.reason === "plan_not_included"
              ? "SMS automation is not included in this plan."
              : entitlement.reason === "monthly_limit_reached"
                ? "Monthly SMS limit reached."
                : "Platform SMS provider is not configured.",
        });
      }
      const phone = normalizeSmsPhone(input.phone);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [recent] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(smsPhoneVerifications)
        .where(
          and(
            eq(smsPhoneVerifications.tenantId, tenantId),
            gte(smsPhoneVerifications.createdAt, oneHourAgo),
          ),
        );
      if (Number(recent?.total ?? 0) >= 3) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many verification codes requested. Try again in one hour.",
        });
      }

      const credentials = resolveSmsCredentials({
        tenantSlug: tenant.slug,
        connection: null,
        env,
        allowPlatformManaged: true,
      });
      if (!credentials) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Platform SMS provider is not configured.",
        });
      }

      const code = generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.insert(smsPhoneVerifications).values({
        tenantId,
        phone,
        codeHash: hashVerificationCode(tenantId, phone, code),
        expiresAt,
      });
      const [message] = await db
        .insert(messages)
        .values({
          tenantId,
          channel: "sms",
          direction: "outbound",
          fromAddress: credentials.senderAddress,
          toAddress: phone,
          body: `${tenant.name}: Your SMS verification code is ${code}. It expires in 10 minutes.`,
          messageType: "verification",
          status: "queued",
          meta: {
            provider: credentials.provider,
            purpose: "phone_verification",
            credentialMode: credentials.mode,
          },
        })
        .returning({ id: messages.id });
      if (!message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await enqueueSmsSendJob({ tenantId, messageId: message.id });
      return { ok: true, phone, expiresAt };
    }),

  confirmBusinessPhoneVerification: requires("admin")
    .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [verification] = await db
        .select()
        .from(smsPhoneVerifications)
        .where(
          and(
            eq(smsPhoneVerifications.tenantId, tenantId),
            eq(smsPhoneVerifications.status, "pending"),
          ),
        )
        .orderBy(desc(smsPhoneVerifications.createdAt))
        .limit(1);
      if (!verification) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No pending verification code found." });
      }
      if (verification.expiresAt.getTime() < Date.now()) {
        await db
          .update(smsPhoneVerifications)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(smsPhoneVerifications.id, verification.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "Verification code expired." });
      }
      if (verification.attemptCount >= 3) {
        await db
          .update(smsPhoneVerifications)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(smsPhoneVerifications.id, verification.id));
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts." });
      }
      const expected = hashVerificationCode(tenantId, verification.phone, input.code);
      if (expected !== verification.codeHash) {
        await db
          .update(smsPhoneVerifications)
          .set({ attemptCount: verification.attemptCount + 1, updatedAt: new Date() })
          .where(eq(smsPhoneVerifications.id, verification.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "Verification code is incorrect." });
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(smsPhoneVerifications)
          .set({ status: "verified", verifiedAt: now, updatedAt: now })
          .where(eq(smsPhoneVerifications.id, verification.id));
        const [profile] = await tx
          .select({
            id: businessProfiles.id,
            leadCaptureSettings: businessProfiles.leadCaptureSettings,
          })
          .from(businessProfiles)
          .where(eq(businessProfiles.tenantId, tenantId))
          .limit(1);
        if (profile) {
          const existing = leadSettingsRecord(profile.leadCaptureSettings);
          const sms = {
            ...smsSettingsRecord(profile.leadCaptureSettings),
            businessPhone: verification.phone,
            phoneVerifiedAt: now.toISOString(),
          };
          await tx
            .update(businessProfiles)
            .set({ leadCaptureSettings: { ...existing, sms }, updatedAt: now })
            .where(eq(businessProfiles.id, profile.id));
        }
      });
      return { ok: true, phone: verification.phone };
    }),
});
