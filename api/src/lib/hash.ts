/**
 * Deterministic, salted hashing of raw sender ids (phone numbers, chat ids,
 * web session ids) before they are used to address a Durable Object or
 * written anywhere. This is why a `ConversationDO` can never leak a phone
 * number even if its storage were somehow exfiltrated — it never has one.
 */
function toUrlSafeBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256(salt, value), truncated to 22 base64url chars (~132 bits — plenty for this). */
export async function hashSenderId(salt: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toUrlSafeBase64(signature).slice(0, 22);
}
