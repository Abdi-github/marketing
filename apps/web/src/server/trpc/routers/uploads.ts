import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, mediaAssets } from "@marketing/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  createPresignedPutObjectUrl,
  createTenantUploadKey,
  hasObjectStorageConfig,
} from "../../storage/scaleway-s3";
import { tenantProcedure, router } from "../trpc";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const imageContentTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const uploadScopeSchema = z.enum([
  "logo",
  "brand-favicon",
  "brand-social-preview",
  "section-image",
  "social-creative",
  "form-attachment",
]);

export const uploadsRouter = router({
  signedUrl: tenantProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(200),
        contentType: imageContentTypeSchema,
        byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
        scope: uploadScopeSchema,
        visibility: z.enum(["public", "private"]).default("public"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;

      if (!hasObjectStorageConfig()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Object storage is not configured.",
        });
      }

      const assetId = randomUUID();
      const objectKey = createTenantUploadKey({
        tenantId,
        scope: input.scope,
        filename: input.filename,
        contentType: input.contentType,
      });
      const presigned = createPresignedPutObjectUrl({ objectKey });
      const publicUrl = `/api/media/assets/${assetId}`;

      await db.insert(mediaAssets).values({
        id: assetId,
        tenantId,
        bucket: presigned.bucket,
        objectKey: presigned.objectKey,
        publicUrl,
        originalFilename: input.filename,
        contentType: input.contentType,
        byteSize: input.byteSize,
        scope: input.scope,
        visibility: input.visibility,
        status: "pending",
      });

      return {
        assetId,
        uploadUrl: presigned.uploadUrl,
        publicUrl,
        objectKey: presigned.objectKey,
        maxBytes: MAX_IMAGE_BYTES,
      };
    }),

  complete: tenantProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [asset] = await db
        .update(mediaAssets)
        .set({ status: "uploaded", uploadedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, input.assetId)))
        .returning({
          id: mediaAssets.id,
          publicUrl: mediaAssets.publicUrl,
          contentType: mediaAssets.contentType,
          byteSize: mediaAssets.byteSize,
        });

      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Uploaded asset not found." });
      }

      return asset;
    }),

  list: tenantProcedure
    .input(
      z
        .object({
          scopes: z.array(uploadScopeSchema).max(4).optional(),
          limit: z.number().int().min(1).max(100).default(48),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const where = and(
        eq(mediaAssets.tenantId, tenantId),
        ne(mediaAssets.status, "archived"),
        input?.scopes?.length ? inArray(mediaAssets.scope, input.scopes) : undefined,
      );

      return db
        .select({
          id: mediaAssets.id,
          publicUrl: mediaAssets.publicUrl,
          originalFilename: mediaAssets.originalFilename,
          contentType: mediaAssets.contentType,
          byteSize: mediaAssets.byteSize,
          scope: mediaAssets.scope,
          status: mediaAssets.status,
          createdAt: mediaAssets.createdAt,
          uploadedAt: mediaAssets.uploadedAt,
        })
        .from(mediaAssets)
        .where(where)
        .orderBy(desc(mediaAssets.createdAt))
        .limit(input?.limit ?? 48);
    }),

  archive: tenantProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { tenantId } = ctx.tenantCtx;
      const [asset] = await db
        .update(mediaAssets)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(mediaAssets.tenantId, tenantId), eq(mediaAssets.id, input.assetId)))
        .returning({ id: mediaAssets.id });

      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found." });
      }

      return { archived: true, assetId: asset.id };
    }),
});
