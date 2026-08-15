/**
 * Constant-time string comparison. Used for verify-token and secret-header
 * checks (WhatsApp handshake, Telegram webhook secret) where a fast-fail
 * on the first mismatched byte would leak timing information about how much
 * of the secret an attacker has guessed correctly.
 *
 * Workers expose `crypto.subtle.timingSafeEqual` (Web Crypto), which compares
 * `ArrayBuffer`s of equal length — so we length-check first (a length
 * mismatch is not secret-dependent, so this is safe to short-circuit) and
 * encode both strings to UTF-8 before comparing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  const subtleWithTimingSafeEqual = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
  };
  if (typeof subtleWithTimingSafeEqual.timingSafeEqual === "function") {
    return subtleWithTimingSafeEqual.timingSafeEqual(bufA, bufB);
  }
  // Fallback (e.g. a test runner without the Workers-specific extension):
  // manual constant-time compare — always walk the full length, XOR-accumulate.
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}
