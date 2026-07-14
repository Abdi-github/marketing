import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, mediaAssets } from "@marketing/db";
import { env } from "@marketing/shared";
import { and, eq } from "drizzle-orm";
import { storeGeneratedBinaryAsset } from "./social-creative-storage";

export type MediaAssetScope = "logo" | "section-image" | "social-creative" | "form-attachment";

type RegisterStoredMediaAssetInput = {
  tenantId: string;
  scope: MediaAssetScope;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  visibility?: "public" | "private";
  assetId?: string;
};

export async function registerStoredMediaAsset(input: RegisterStoredMediaAssetInput): Promise<{
  assetId: string;
  publicUrl: string;
}> {
  const assetId = input.assetId ?? randomUUID();
  const publicUrl = `/api/media/assets/${assetId}`;
  const now = new Date();

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id: assetId,
      tenantId: input.tenantId,
      bucket: input.storageKey.startsWith("local:") ? "local" : "generated",
      objectKey: input.storageKey,
      publicUrl,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      byteSize: input.byteSize,
      scope: input.scope,
      visibility: input.visibility ?? "public",
      status: "uploaded",
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: mediaAssets.objectKey,
      set: {
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        byteSize: input.byteSize,
        scope: input.scope,
        visibility: input.visibility ?? "public",
        status: "uploaded",
        uploadedAt: now,
        updatedAt: now,
      },
    })
    .returning({ id: mediaAssets.id, publicUrl: mediaAssets.publicUrl });

  if (!asset) {
    throw new Error(`Could not register media asset for object key ${input.storageKey}.`);
  }

  const canonicalPublicUrl = `/api/media/assets/${asset.id}`;
  if (asset.publicUrl !== canonicalPublicUrl) {
    await db
      .update(mediaAssets)
      .set({ publicUrl: canonicalPublicUrl, updatedAt: now })
      .where(eq(mediaAssets.id, asset.id));
  }

  return {
    assetId: asset.id,
    publicUrl: canonicalPublicUrl,
  };
}

export async function ingestRemoteImageToMediaAsset(input: {
  tenantId: string;
  scope: MediaAssetScope;
  sourceUrl: string;
  originalFilenameBase: string;
  storageKeyPrefix: string;
  visibility?: "public" | "private";
}): Promise<{
  assetId: string;
  publicUrl: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
}> {
  const tenantPrefix = `${input.tenantId}/`;
  if (!input.storageKeyPrefix.startsWith(tenantPrefix)) {
    throw new Error("Generated media storage keys must use the tenant prefix.");
  }

  const response = await fetch(input.sourceUrl, {
    headers: {
      accept: "image/*",
      "user-agent": "marketing-saas/worker-media-ingest",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Remote image fetch failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const contentTypeHeader = response.headers.get("content-type") ?? "image/png";
  const contentType = contentTypeHeader.split(";")[0]?.trim().toLowerCase() || "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Remote asset is not an image (${contentTypeHeader}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const extension = inferImageExtension(contentType, input.sourceUrl);
  const objectKey = `${input.storageKeyPrefix}/${Date.now()}-${randomUUID()}.${extension}`;
  const stored = await storeGeneratedBinaryAsset({
    key: objectKey,
    body: bytes,
    contentType,
  });
  const asset = await registerStoredMediaAsset({
    tenantId: input.tenantId,
    scope: input.scope,
    storageKey: stored.storageKey,
    originalFilename: `${input.originalFilenameBase}.${extension}`,
    contentType,
    byteSize: bytes.byteLength,
    visibility: input.visibility,
  });

  return {
    assetId: asset.assetId,
    publicUrl: asset.publicUrl,
    storageKey: stored.storageKey,
    contentType,
    byteSize: bytes.byteLength,
  };
}

function inferImageExtension(contentType: string, sourceUrl: string): string {
  const directMatch = contentType.match(/^image\/([a-z0-9.+-]+)$/i)?.[1]?.toLowerCase();
  if (directMatch === "jpeg") return "jpg";
  if (directMatch === "svg+xml") return "svg";
  if (directMatch) return directMatch;

  try {
    const pathname = new URL(sourceUrl).pathname;
    const raw = pathname.split(".").pop()?.toLowerCase();
    if (raw && /^[a-z0-9]+$/.test(raw)) return raw;
  } catch {
    // Ignore URL parsing failures and fall back to png.
  }

  return "png";
}

export async function findMediaAssetPublicUrlByObjectKey(
  objectKey: string,
): Promise<string | null> {
  const [asset] = await db
    .select({ publicUrl: mediaAssets.publicUrl, id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.objectKey, objectKey));
  if (!asset) return null;
  return asset.publicUrl ?? `/api/media/assets/${asset.id}`;
}

export async function resolveMediaAssetForImageInput(input: {
  tenantId: string;
  imageUrl: string;
}): Promise<string> {
  if (/^https?:\/\//i.test(input.imageUrl) || input.imageUrl.startsWith("data:")) {
    return input.imageUrl;
  }

  const [asset] = await db
    .select({
      objectKey: mediaAssets.objectKey,
      contentType: mediaAssets.contentType,
    })
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.tenantId, input.tenantId), eq(mediaAssets.publicUrl, input.imageUrl)),
    );

  if (!asset) {
    throw new Error("The source image could not be found.");
  }

  if (!asset.objectKey.startsWith("local:")) {
    return new URL(input.imageUrl, env.APP_URL).toString();
  }

  const relativeKey = asset.objectKey.slice("local:".length).replace(/\\/g, "/");
  const candidates = [
    path.resolve(process.cwd(), "..", "web", "public", "generated"),
    path.resolve(process.cwd(), "apps", "web", "public", "generated"),
  ];

  for (const baseDir of candidates) {
    const filePath = path.resolve(baseDir, relativeKey);
    if (!filePath.startsWith(baseDir)) continue;
    try {
      const bytes = await readFile(filePath);
      return `data:${asset.contentType};base64,${bytes.toString("base64")}`;
    } catch {
      // Try the next development layout.
    }
  }

  throw new Error("The source image file could not be read.");
}
