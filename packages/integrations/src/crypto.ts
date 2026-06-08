/**
 * Encrypt/decrypt integration credentials at rest.
 *
 * Algorithm: AES-256-GCM (authenticated encryption; prevents silent tampering).
 * Key source: INTEGRATION_ENCRYPTION_KEY env var — 64 hex chars (256 bits).
 *
 * Output format: base64url("<12-byte-iv><ciphertext><16-byte-auth-tag>")
 * The IV is random per call; the auth-tag is appended by Node's crypto.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(hexKey: string): Buffer {
  if (hexKey.length !== 64) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be exactly 64 hex chars (256 bits)");
  }
  return Buffer.from(hexKey, "hex");
}

export function encryptCredentials(plaintext: string, hexKey: string): string {
  const key = loadKey(hexKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ciphertext, tag]).toString("base64url");
}

export function decryptCredentials(blob: string, hexKey: string): string {
  const key = loadKey(hexKey);
  const buf = Buffer.from(blob, "base64url");

  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}

/** Serialize + encrypt a credentials object. */
export function encryptTokens(tokens: Record<string, unknown>, hexKey: string): string {
  return encryptCredentials(JSON.stringify(tokens), hexKey);
}

/** Decrypt + parse a credentials blob. */
export function decryptTokens(blob: string, hexKey: string): Record<string, unknown> {
  return JSON.parse(decryptCredentials(blob, hexKey)) as Record<string, unknown>;
}
