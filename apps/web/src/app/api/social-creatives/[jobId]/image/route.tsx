import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { db } from "@marketing/db";
import { brandAssets, businessProfiles, socialPosts } from "@marketing/db";
import { env } from "@marketing/shared";
import { eq } from "drizzle-orm";
import {
  buildSocialCreativePlan,
  getSocialCreativeDimensions,
  parsePromptInput,
  parseSocialCreativePlan,
} from "../../../../../lib/social-creative";
import { renderSocialCreative } from "../../../../../lib/social-creative-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params;
  const requestOrigin = new URL(req.url).origin;

  const [post] = await db
    .select({
      jobId: socialPosts.jobId,
      tenantId: socialPosts.tenantId,
      status: socialPosts.status,
      generatedText: socialPosts.generatedText,
      imageUrl: socialPosts.imageUrl,
      promptInput: socialPosts.promptInput,
      creativePlan: socialPosts.creativePlan,
      creativeAspectRatio: socialPosts.creativeAspectRatio,
      creativeTemplate: socialPosts.creativeTemplate,
      creativeImageUrl: socialPosts.creativeImageUrl,
      creativeStorageKey: socialPosts.creativeStorageKey,
    })
    .from(socialPosts)
    .where(eq(socialPosts.jobId, jobId));

  if (!post || post.status !== "completed" || !post.generatedText) {
    return new Response("Not found", { status: 404 });
  }

  const storedResponse = await readStoredCreativePng({
    storageKey: post.creativeStorageKey,
    legacyImageUrl: post.creativeImageUrl,
    requestOrigin,
    currentRequestUrl: req.url,
  });
  if (storedResponse) {
    return storedResponse;
  }

  if (!post.creativePlan) {
    return new Response("Not found", { status: 404 });
  }

  const [profile] = await db
    .select({
      businessName: businessProfiles.businessName,
      vertical: businessProfiles.vertical,
      city: businessProfiles.addressCity,
    })
    .from(businessProfiles)
    .where(eq(businessProfiles.tenantId, post.tenantId));

  const [brand] = await db
    .select({
      logoUrl: brandAssets.logoUrl,
      colorPrimary: brandAssets.colorPrimary,
      colorSecondary: brandAssets.colorSecondary,
      fontHeading: brandAssets.fontHeading,
      fontBody: brandAssets.fontBody,
    })
    .from(brandAssets)
    .where(eq(brandAssets.tenantId, post.tenantId));

  const promptInput = parsePromptInput(post.promptInput);
  const plan =
    parseSocialCreativePlan(post.creativePlan) ??
    buildSocialCreativePlan({
      businessName: profile?.businessName ?? "My Business",
      vertical: profile?.vertical,
      city: profile?.city,
      topic: promptInput.topic,
      highlights: promptInput.highlights,
      postText: post.generatedText,
      imageUrl: post.imageUrl,
      aspectRatio:
        post.creativeAspectRatio === "1:1" || post.creativeAspectRatio === "9:16"
          ? post.creativeAspectRatio
          : "4:5",
      template:
        post.creativeTemplate === "promo-badge" ||
        post.creativeTemplate === "editorial-collage" ||
        post.creativeTemplate === "event-poster" ||
        post.creativeTemplate === "story-card" ||
        post.creativeTemplate === "retail-offer" ||
        post.creativeTemplate === "product-hero" ||
        post.creativeTemplate === "testimonial-proof" ||
        post.creativeTemplate === "carousel-cover"
          ? post.creativeTemplate
          : "auto",
    });

  const { width, height } = getSocialCreativeDimensions(plan.aspectRatio);
  const imageUrl = await resolveOgImageSrc(plan.backgroundImageUrl ?? post.imageUrl, requestOrigin);
  const logoUrl = await resolveOgImageSrc(brand?.logoUrl ?? null, requestOrigin);

  return new ImageResponse(
    renderSocialCreative({
      plan,
      imageUrl,
      businessName: profile?.businessName ?? "My Business",
      brand: brand ? { ...brand, logoUrl } : brand,
    }),
    { width, height },
  );
}

async function resolveOgImageSrc(
  imageUrl: string | null,
  requestOrigin: string,
): Promise<string | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:")) return imageUrl;

  try {
    const absoluteUrl = toAbsoluteAssetUrl(imageUrl, requestOrigin);
    const response = await fetch(absoluteUrl, {
      headers: { accept: "image/png,image/jpeg,image/svg+xml,image/*;q=0.8" },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType || !isSupportedOgImageType(contentType)) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function isSupportedOgImageType(contentType: string): boolean {
  return (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/jpg" ||
    contentType === "image/svg+xml"
  );
}

async function readStoredCreativePng(input: {
  storageKey: string | null;
  legacyImageUrl: string | null;
  requestOrigin: string;
  currentRequestUrl: string;
}): Promise<Response | null> {
  const storageKey = input.storageKey ?? getStorageKeyFromScalewayUrl(input.legacyImageUrl);
  if (!storageKey) {
    return fetchLegacyPublicAsset(
      input.legacyImageUrl,
      input.requestOrigin,
      input.currentRequestUrl,
    );
  }

  if (storageKey.startsWith("local:")) {
    return readLocalGeneratedAsset(storageKey.slice("local:".length));
  }

  if (!hasScalewayStorageConfig()) {
    return fetchLegacyPublicAsset(
      input.legacyImageUrl,
      input.requestOrigin,
      input.currentRequestUrl,
    );
  }
  return fetchScalewayObject(storageKey);
}

async function readLocalGeneratedAsset(relativeKey: string): Promise<Response | null> {
  try {
    const normalizedKey = relativeKey.replace(/\\/g, "/").replace(/^\/+/, "");
    const filePath = path.resolve(process.cwd(), "public", "generated", normalizedKey);
    const bytes = await readFile(filePath);
    return pngResponse(bytes);
  } catch {
    return null;
  }
}

function hasScalewayStorageConfig(): boolean {
  return Boolean(
    env.SCALEWAY_ACCESS_KEY &&
    env.SCALEWAY_SECRET_KEY &&
    env.SCALEWAY_BUCKET_NAME &&
    env.SCALEWAY_REGION &&
    env.SCALEWAY_ENDPOINT,
  );
}

async function fetchScalewayObject(key: string): Promise<Response | null> {
  const endpoint = new URL(env.SCALEWAY_ENDPOINT!);
  const bucket = env.SCALEWAY_BUCKET_NAME!;
  const region = env.SCALEWAY_REGION!;
  const pathName = `/${bucket}/${encodeS3Key(key)}`;
  const url = new URL(pathName, endpoint);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = url.host;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([headerKey, value]) => `${headerKey}:${value}\n`)
    .join("");
  const canonicalRequest = ["GET", pathName, "", canonicalHeaders, signedHeaders, payloadHash].join(
    "\n",
  );
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(env.SCALEWAY_SECRET_KEY!, dateStamp, region, "s3");
  const signature = hmacHex(signingKey, stringToSign);
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${env.SCALEWAY_ACCESS_KEY!}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(url, { headers: { ...headers, authorization } });
    if (!response.ok) return null;
    return pngResponse(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

async function fetchLegacyPublicAsset(
  legacyImageUrl: string | null,
  requestOrigin: string,
  currentRequestUrl: string,
): Promise<Response | null> {
  if (!legacyImageUrl) return null;

  try {
    const url = toAbsoluteAssetUrl(legacyImageUrl, requestOrigin);
    if (isSameSocialCreativeRenderUrl(url, currentRequestUrl)) {
      return null;
    }
    const response = await fetch(url, {
      headers: { accept: "image/png,image/jpeg,image/svg+xml,image/*;q=0.8" },
    });
    if (!response.ok) return null;

    return pngResponse(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function toAbsoluteAssetUrl(value: string, requestOrigin: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return new URL(value, `${requestOrigin.replace(/\/$/, "")}/`).toString();
  }
}

function isSameSocialCreativeRenderUrl(candidateUrl: string, currentRequestUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const current = new URL(currentRequestUrl);
    return candidate.origin === current.origin && candidate.pathname === current.pathname;
  } catch {
    return false;
  }
}

function getStorageKeyFromScalewayUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    if (!url.hostname.endsWith("scw.cloud")) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const bucketIndex = parts.findIndex((part) => part === env.SCALEWAY_BUCKET_NAME);
    if (bucketIndex < 0) return null;

    return parts
      .slice(bucketIndex + 1)
      .map(decodeURIComponent)
      .join("/");
  } catch {
    return null;
  }
}

function pngResponse(bytes: Uint8Array): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/png",
    },
  });
}

function encodeS3Key(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}
