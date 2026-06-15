import { createHash, createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, logger } from "@marketing/shared";

type StoreSocialCreativeInput = {
  tenantId: string;
  postJobId: string;
  version: Date;
  png: Uint8Array;
};

type StoredSocialCreative = {
  publicUrl: string;
  storageKey: string;
};

type StoreGeneratedBinaryAssetInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
};

export async function storeSocialCreativePng(
  input: StoreSocialCreativeInput,
): Promise<StoredSocialCreative> {
  const key = `social-creatives/${input.tenantId}/${input.postJobId}-${input.version.getTime()}.png`;

  const stored = await storeGeneratedBinaryAsset({
    key,
    body: input.png,
    contentType: "image/png",
  });

  const publicUrl = stored.storageKey.startsWith("local:")
    ? `${env.APP_URL.replace(/\/$/, "")}/generated/${stored.storageKey.slice("local:".length).replace(/\\/g, "/")}`
    : new URL(`/${env.SCALEWAY_BUCKET_NAME}/${encodeS3Key(key)}`, env.SCALEWAY_ENDPOINT).toString();

  return { publicUrl, storageKey: stored.storageKey };
}

export async function storeGeneratedBinaryAsset(
  input: StoreGeneratedBinaryAssetInput,
): Promise<{ storageKey: string }> {
  if (hasScalewayStorageConfig()) {
    return putScalewayObject(input);
  }

  return storeLocalPublicAsset(input);
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

async function storeLocalPublicAsset(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ storageKey: string }> {
  const cwd = process.cwd();
  const webPublicDir = existsSync(path.resolve(cwd, "..", "web", "public"))
    ? path.resolve(cwd, "..", "web", "public", "generated")
    : path.resolve(cwd, "apps", "web", "public", "generated");
  const relativeKey = input.key.replace(/^social-creatives\//, "social-creatives/");
  const filePath = path.join(webPublicDir, relativeKey);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.body);

  logger.info({ key: relativeKey }, "[social-creative] stored local generated asset");

  return { storageKey: `local:${relativeKey}` };
}

async function putScalewayObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ storageKey: string }> {
  const endpoint = new URL(env.SCALEWAY_ENDPOINT!);
  const bucket = env.SCALEWAY_BUCKET_NAME!;
  const region = env.SCALEWAY_REGION!;
  const pathName = `/${bucket}/${encodeS3Key(input.key)}`;
  const url = new URL(pathName, endpoint);
  const payloadHash = sha256Hex(input.body);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = url.host;
  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": input.contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
  const canonicalRequest = ["PUT", pathName, "", canonicalHeaders, signedHeaders, payloadHash].join(
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

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, authorization },
    body: input.body,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Scaleway object upload failed (${response.status}): ${body.slice(0, 240)}`);
  }

  return { storageKey: input.key };
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
