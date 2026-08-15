/**
 * AES-256-GCM encrypt/decrypt for tenant channel credentials at rest in D1
 * (multi-tenant mode). The key is the deployment's TENANT_SECRETS_KEY secret
 * — one key per Worker deployment, not per tenant; per-tenant isolation comes
 * from each tenant's row, not from key separation. Rotate by decrypting all
 * rows with the old key and re-encrypting with a new one (see docs/SAAS.md).
 */

export interface EncryptedPayload {
  iv: string; // base64
  data: string; // base64
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  if (raw.byteLength !== 32) {
    throw new Error("TENANT_SECRETS_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function encryptJson(base64Key: string, value: unknown): Promise<EncryptedPayload> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv.buffer), data: toBase64(ciphertext) };
}

export async function decryptJson<T>(base64Key: string, payload: EncryptedPayload): Promise<T> {
  const key = await importKey(base64Key);
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.data);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
