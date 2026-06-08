import { describe, expect, it } from "vitest";
import { encryptTokens, decryptTokens, encryptCredentials, decryptCredentials } from "../crypto";

const TEST_KEY = "a".repeat(64); // 64 hex chars = 256-bit key

describe("credentials encryption", () => {
  it("round-trips a plain string", () => {
    const blob = encryptCredentials("hello world", TEST_KEY);
    expect(decryptCredentials(blob, TEST_KEY)).toBe("hello world");
  });

  it("produces different ciphertexts on each call (random IV)", () => {
    const b1 = encryptCredentials("same input", TEST_KEY);
    const b2 = encryptCredentials("same input", TEST_KEY);
    expect(b1).not.toBe(b2);
  });

  it("round-trips a tokens object", () => {
    const tokens = { api_key: "sk-abc123", location_id: "loc-001" };
    const blob = encryptTokens(tokens, TEST_KEY);
    const decoded = decryptTokens(blob, TEST_KEY);
    expect(decoded).toEqual(tokens);
  });

  it("throws on tampered ciphertext (GCM auth tag fails)", () => {
    const blob = encryptCredentials("sensitive", TEST_KEY);
    const buf = Buffer.from(blob, "base64url");
    // Flip a byte in the ciphertext portion
    buf[15] = buf[15]! ^ 0xff;
    const tampered = buf.toString("base64url");
    expect(() => decryptCredentials(tampered, TEST_KEY)).toThrow();
  });

  it("throws on wrong key length", () => {
    expect(() => encryptCredentials("x", "tooshort")).toThrow();
  });
});
