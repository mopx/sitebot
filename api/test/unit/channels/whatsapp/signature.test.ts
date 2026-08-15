import { describe, expect, it } from "vitest";
import { verifyWhatsAppSignature } from "../../../../src/channels/whatsapp/signature.js";

const APP_SECRET = "test-app-secret";
const BODY = '{"entry":[{"changes":[{"value":{}}]}]}';

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

describe("verifyWhatsAppSignature", () => {
  it("accepts a correctly-signed body", async () => {
    const header = await sign(BODY, APP_SECRET);
    expect(await verifyWhatsAppSignature(BODY, header, APP_SECRET)).toBe(true);
  });

  it("rejects a body that was altered after signing", async () => {
    const header = await sign(BODY, APP_SECRET);
    const tampered = BODY.replace("{}", '{"x":1}');
    expect(await verifyWhatsAppSignature(tampered, header, APP_SECRET)).toBe(false);
  });

  it("rejects when the app secret doesn't match", async () => {
    const header = await sign(BODY, APP_SECRET);
    expect(await verifyWhatsAppSignature(BODY, header, "wrong-secret")).toBe(false);
  });

  it("rejects a missing signature header", async () => {
    expect(await verifyWhatsAppSignature(BODY, null, APP_SECRET)).toBe(false);
  });

  it("rejects a header with the wrong prefix (e.g. sha1=)", async () => {
    const header = await sign(BODY, APP_SECRET);
    const wrongPrefix = header.replace("sha256=", "sha1=");
    expect(await verifyWhatsAppSignature(BODY, wrongPrefix, APP_SECRET)).toBe(false);
  });

  it("does not throw on a malformed (non-hex) signature", async () => {
    await expect(verifyWhatsAppSignature(BODY, "sha256=not-hex-!!", APP_SECRET)).resolves.toBe(
      false,
    );
  });
});
