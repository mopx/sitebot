import { describe, expect, it } from "vitest";
import { hashSenderId } from "../../../src/lib/hash.js";

describe("hashSenderId", () => {
  it("is deterministic for the same salt and value", async () => {
    const a = await hashSenderId("salt-1", "+15551234567");
    const b = await hashSenderId("salt-1", "+15551234567");
    expect(a).toBe(b);
  });

  it("differs for different values under the same salt", async () => {
    const a = await hashSenderId("salt-1", "+15551234567");
    const b = await hashSenderId("salt-1", "+15559876543");
    expect(a).not.toBe(b);
  });

  it("differs for the same value under different salts", async () => {
    const a = await hashSenderId("salt-1", "+15551234567");
    const b = await hashSenderId("salt-2", "+15551234567");
    expect(a).not.toBe(b);
  });

  it("never contains the raw value or plain '+' characters (base64url output)", async () => {
    const hash = await hashSenderId("salt-1", "+15551234567");
    expect(hash).not.toContain("+15551234567");
    expect(hash).not.toMatch(/[+/=]/);
  });

  it("is a fixed length", async () => {
    const short = await hashSenderId("salt-1", "a");
    const long = await hashSenderId("salt-1", "a-much-longer-sender-identifier-string");
    expect(short.length).toBe(22);
    expect(long.length).toBe(22);
  });
});
