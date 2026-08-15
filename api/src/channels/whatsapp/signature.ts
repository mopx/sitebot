import { timingSafeEqual } from "../../lib/timingSafe.js";

/**
 * Verifies Meta's `X-Hub-Signature-256` header: `sha256=<hex HMAC of the raw body>`.
 *
 * Must be called with the EXACT raw bytes Meta sent — read the body as text
 * before any JSON parsing (`await c.req.text()`, not `c.req.json()`).
 * Re-serializing a parsed body will not reproduce Meta's exact bytes and
 * every signature check will fail.
 */
export async function verifyWhatsAppSignature(
  rawBody: string,
  headerValue: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!headerValue || !headerValue.startsWith("sha256=")) return false;
  const providedHex = headerValue.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expectedHex, providedHex);
}
