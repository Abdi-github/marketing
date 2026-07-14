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
  try {
    return await renderCreativeImage(req, await params);
  } catch (error) {
    if (isDatabasePoolExhaustion(error)) {
      console.error("[social-creatives] Database pool exhausted", { err: String(error) });
      return new Response("Temporarily unavailable", {
        status: 503,
        headers: { "cache-control": "no-store", "retry-after": "2" },
      });
    }
    throw error;
  }
}

async function renderCreativeImage(req: Request, { jobId }: { jobId: string }): Promise<Response> {
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

  const businessName = profile?.businessName ?? "My Business";
  try {
    const rendered = new ImageResponse(
      renderSocialCreative({
        plan,
        imageUrl,
        businessName,
        brand: brand ? { ...brand, logoUrl } : brand,
      }),
      { width, height },
    );
    // ImageResponse renders lazily. Consuming it here keeps stream-time errors
    // inside this try/catch so clients never receive an empty response.
    const png = new Uint8Array(await rendered.arrayBuffer());
    return pngResponse(png);
  } catch (err) {
    console.error("[social-creatives] ImageResponse render failed", {
      jobId,
      err: String(err),
    });
    return svgFallbackResponse({
      width,
      height,
      businessName,
      headline: plan.headline,
      subheading: plan.subheading,
      badge: plan.badge,
      cta: plan.cta,
      footer: plan.footer,
      primary: brand?.colorPrimary ?? "#111827",
      secondary: brand?.colorSecondary ?? "#f59e0b",
    });
  }
}

function isDatabasePoolExhaustion(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "XX000" || /EMAXCONNSESSION|max clients reached/i.test(error.message);
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

function svgFallbackResponse(input: {
  width: number;
  height: number;
  businessName: string;
  headline: string;
  subheading: string;
  badge: string;
  cta: string;
  footer: string;
  primary: string;
  secondary: string;
}): Response {
  const primary = normalizeHexColor(input.primary, "#111827");
  const secondary = normalizeHexColor(input.secondary, "#f59e0b");
  const bg = mixHex(primary, "#ffffff", 0.92);
  const soft = mixHex(secondary, "#ffffff", 0.78);
  const headlineLines = wrapSvgText(input.headline, 18).slice(0, 3);
  const subheadingLines = wrapSvgText(input.subheading, 34).slice(0, 3);
  const isTall = input.height > input.width;
  const headlineSize = isTall ? 78 : 72;
  const subheadingSize = isTall ? 32 : 30;
  const left = isTall ? 64 : 76;
  const top = isTall ? 72 : 68;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${escapeXml(bg)}"/>
      <stop offset="58%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${escapeXml(soft)}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="${input.width * 0.86}" cy="${input.height * 0.16}" r="${input.width * 0.22}" fill="${escapeXml(secondary)}" opacity="0.18"/>
  <circle cx="${input.width * 0.1}" cy="${input.height * 0.88}" r="${input.width * 0.3}" fill="${escapeXml(primary)}" opacity="0.08"/>
  <rect x="${left}" y="${top}" width="${input.width - left * 2}" height="${input.height - top * 2}" rx="42" fill="#ffffff" opacity="0.84"/>
  <text x="${left + 42}" y="${top + 72}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="${escapeXml(primary)}">${escapeXml(input.businessName)}</text>
  <rect x="${left + 42}" y="${top + 108}" width="210" height="56" rx="28" fill="${escapeXml(primary)}"/>
  <text x="${left + 66}" y="${top + 146}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="#ffffff">${escapeXml(clampText(input.badge, 18))}</text>
  ${headlineLines
    .map(
      (line, index) =>
        `<text x="${left + 42}" y="${top + 250 + index * (headlineSize + 8)}" font-family="Arial, Helvetica, sans-serif" font-size="${headlineSize}" font-weight="900" fill="${escapeXml(primary)}">${escapeXml(line)}</text>`,
    )
    .join("")}
  ${subheadingLines
    .map(
      (line, index) =>
        `<text x="${left + 44}" y="${top + 510 + index * (subheadingSize + 10)}" font-family="Arial, Helvetica, sans-serif" font-size="${subheadingSize}" font-weight="600" fill="#475569">${escapeXml(line)}</text>`,
    )
    .join("")}
  <rect x="${left + 42}" y="${input.height - top - 106}" width="270" height="64" rx="32" fill="${escapeXml(secondary)}"/>
  <text x="${left + 72}" y="${input.height - top - 64}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="${escapeXml(primary)}">${escapeXml(clampText(input.cta, 22))}</text>
  <text x="${input.width - left - 42}" y="${input.height - top - 62}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#64748b">${escapeXml(clampText(input.footer, 34))}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "image/svg+xml; charset=utf-8",
      "x-social-creative-render": "fallback",
    },
  });
}

function wrapSvgText(value: string, maxChars: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["Your update"];
}

function clampText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  return fallback;
}

function mixHex(a: string, b: string, weight: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const mix = (x: number, y: number) => Math.round(x * (1 - weight) + y * weight);
  return `#${[mix(ca[0], cb[0]), mix(ca[1], cb[1]), mix(ca[2], cb[2])]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseHex(value: string): [number, number, number] {
  const hex = normalizeHexColor(value, "#000000").slice(1);
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
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
