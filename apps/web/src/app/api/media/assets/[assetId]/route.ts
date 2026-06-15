import { db, mediaAssets } from "@marketing/db";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  fetchObjectFromStorage,
  hasObjectStorageConfig,
} from "../../../../../server/storage/scaleway-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await params;

  const [asset] = await db
    .select({
      id: mediaAssets.id,
      objectKey: mediaAssets.objectKey,
      contentType: mediaAssets.contentType,
      visibility: mediaAssets.visibility,
      status: mediaAssets.status,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId));

  if (!asset || asset.visibility !== "public" || asset.status !== "uploaded") {
    return new Response("Not found", { status: 404 });
  }

  if (asset.objectKey.startsWith("local:")) {
    const relativeKey = asset.objectKey.slice("local:".length).replace(/\\/g, "/");
    const candidates = [
      path.resolve(process.cwd(), "public", "generated"),
      path.resolve(process.cwd(), "apps", "web", "public", "generated"),
    ];

    for (const baseDir of candidates) {
      const filePath = path.resolve(baseDir, relativeKey);
      if (!filePath.startsWith(baseDir)) continue;
      try {
        const body = await readFile(filePath);
        return new Response(body, {
          status: 200,
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-type": asset.contentType,
          },
        });
      } catch {
        // Try the next candidate.
      }
    }

    return new Response("Not found", { status: 404 });
  }

  if (!hasObjectStorageConfig()) {
    return new Response("Object storage is not configured", { status: 503 });
  }

  const stored = await fetchObjectFromStorage({ objectKey: asset.objectKey });
  if (!stored) return new Response("Not found", { status: 404 });

  return new Response(stored.body, {
    status: 200,
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": asset.contentType,
    },
  });
}
