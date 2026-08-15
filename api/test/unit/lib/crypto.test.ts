import { describe, expect, it } from "vitest";
import { encryptJson, decryptJson } from "../../../src/lib/crypto.js";

// 32 random bytes, base64 — same shape as a real TENANT_SECRETS_KEY.
const TEST_KEY = "hqhZ8sT1a5t3aG4nH1u1cE0kQx2yZb8wJvV3nX9pQmA=";

describe("encryptJson / decryptJson", () => {
  it("round-trips an object", async () => {
    const value = { accessToken: "secret-token", phoneNumberId: "12345" };
    const encrypted = await encryptJson(TEST_KEY, value);
    const decrypted = await decryptJson<typeof value>(TEST_KEY, encrypted);
    expect(decrypted).toEqual(value);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const value = { a: "b" };
    const first = await encryptJson(TEST_KEY, value);
    const second = await encryptJson(TEST_KEY, value);
    expect(first.data).not.toBe(second.data);
    expect(first.iv).not.toBe(second.iv);
  });

  it("fails to decrypt with the wrong key", async () => {
    const value = { a: "b" };
    const encrypted = await encryptJson(TEST_KEY, value);
    const wrongKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    await expect(decryptJson(wrongKey, encrypted)).rejects.toThrow();
  });

  it("rejects a key that doesn't decode to 32 bytes", async () => {
    await expect(encryptJson("dG9vLXNob3J0", { a: 1 })).rejects.toThrow(/32 bytes/);
  });
});
