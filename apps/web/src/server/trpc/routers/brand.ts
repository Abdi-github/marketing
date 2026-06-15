// Brand kit router — get/upsert brand assets for the current tenant.
// Brand colors + fonts are applied to public landing pages via CSS variables.
// Voice tone is injected into copy prompts as brand context.
import { db } from "@marketing/db";
import { brandAssets } from "@marketing/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requires, tenantProcedure, router } from "../trpc";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (e.g. #111827)");

export const brandRouter = router({
  get: tenantProcedure.query(async ({ ctx }) => {
    const { tenantId } = ctx.tenantCtx;
    const [brand] = await db.select().from(brandAssets).where(eq(brandAssets.tenantId, tenantId));
    return brand ?? null;
  }),

  upsert: requires("admin")
    .input(
      z.object({
        logoUrl: z.string().url().optional().nullable(),
        faviconUrl: z.string().url().optional().nullable(),
        socialPreviewUrl: z.string().url().optional().nullable(),
        colorPrimary: hexColor.optional(),
        colorSecondary: hexColor.optional(),
        fontHeading: z.string().max(100).optional(),
        fontBody: z.string().max(100).optional(),
        voiceTone: z.string().max(300).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
      if (input.faviconUrl !== undefined) patch.faviconUrl = input.faviconUrl;
      if (input.socialPreviewUrl !== undefined) patch.socialPreviewUrl = input.socialPreviewUrl;
      if (input.colorPrimary !== undefined) patch.colorPrimary = input.colorPrimary;
      if (input.colorSecondary !== undefined) patch.colorSecondary = input.colorSecondary;
      if (input.fontHeading !== undefined) patch.fontHeading = input.fontHeading;
      if (input.fontBody !== undefined) patch.fontBody = input.fontBody;
      if (input.voiceTone !== undefined) patch.voiceTone = input.voiceTone;

      await db
        .insert(brandAssets)
        .values({
          tenantId,
          logoUrl: (input.logoUrl as string | null) ?? null,
          faviconUrl: (input.faviconUrl as string | null) ?? null,
          socialPreviewUrl: (input.socialPreviewUrl as string | null) ?? null,
          colorPrimary: input.colorPrimary ?? "#111827",
          colorSecondary: input.colorSecondary ?? "#6b7280",
          fontHeading: input.fontHeading ?? "system-ui",
          fontBody: input.fontBody ?? "system-ui",
          voiceTone: (input.voiceTone as string | null) ?? null,
        })
        .onConflictDoUpdate({
          target: brandAssets.tenantId,
          set: patch,
        });

      return { saved: true };
    }),
});
