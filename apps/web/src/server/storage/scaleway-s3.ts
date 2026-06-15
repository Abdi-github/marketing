import { createHash, createHmac, randomUUID } from "node:crypto";
import { env } from "@marketing/shared";

export type PresignedPutObject = {
  uploadUrl: string;
  bucket: string;
  objectKey: string;
};

export function hasObjectStorageConfig(): boolean {
  return Boolean(
    env.SCALEWAY_ACCESS_KEY &&
    env.SCALEWAY_SECRET_KEY &&
    env.SCALEWAY_BUCKET_NAME &&
    env.SCALEWAY_REGION &&
    env.SCALEWAY_ENDPOINT,
  );
}

export function createTenantUploadKey(input: {
  tenantId: string;
  scope: string;
  filename: string;
  contentType: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = extensionFor(input.filename, input.contentType);
  return `${input.tenantId}/uploads/${input.scope}/${year}/${month}/${randomUUID()}${extension}`;
}

export function createPresignedPutObjectUrl(input: {
  objectKey: string;
  expiresSeconds?: number;
}): PresignedPutObject {
  assertObjectStorageConfig();

  const endpoint = new URL(env.SCALEWAY_ENDPOINT!);
  const bucket = env.SCALEWAY_BUCKET_NAME!;
  const region = env.SCALEWAY_REGION!;
  const pathName = `/${bucket}/${encodeS3Key(input.objectKey)}`;
  const url = new URL(pathName, endpoint);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${env.SCALEWAY_ACCESS_KEY!}/${credentialScope}`;

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", credential);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(input.expiresSeconds ?? 300));
  url.searchParams.set("X-Amz-SignedHeaders", "host");

  const canonicalQuery = canonicalQueryString(url.searchParams);
  const canonicalHeaders = `host:${url.host}\n`;
  const canonicalRequest = [
    "PUT",
    pathName,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(env.SCALEWAY_SECRET_KEY!, dateStamp, region, "s3");
  url.searchParams.set("X-Amz-Signature", hmacHex(signingKey, stringToSign));

  return { uploadUrl: url.toString(), bucket, objectKey: input.objectKey };
}

export async function fetchObjectFromStorage(input: {
  objectKey: string;
}): Promise<Response | null> {
  assertObjectStorageConfig();

  const endpoint = new URL(env.SCALEWAY_ENDPOINT!);
  const bucket = env.SCALEWAY_BUCKET_NAME!;
  const region = env.SCALEWAY_REGION!;
  const pathName = `/${bucket}/${encodeS3Key(input.objectKey)}`;
  const url = new URL(pathName, endpoint);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = "UNSIGNED-PAYLOAD";
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
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
    return response;
  } catch {
    return null;
  }
}

function assertObjectStorageConfig(): void {
  if (!hasObjectStorageConfig()) {
    throw new Error("Object storage is not configured.");
  }
}

function extensionFor(filename: string, contentType: string): string {
  const fromName = filename.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)?.[0];
  if (fromName) return fromName === ".jpeg" ? ".jpg" : fromName;
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  return "";
}

function canonicalQueryString(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
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
