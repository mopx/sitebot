import type { RateLimitBinding } from "../env.js";
import { log } from "./log.js";

/**
 * Layer 1 of the two-layer rate limiter (see docs/ARCHITECTURE.md §Rate
 * limiting): a cheap, eventually-consistent burst brake in front of the exact
 * per-tenant daily quota enforced inside ConversationDO. This layer alone is
 * NOT an accurate accounting system (per Cloudflare's own docs — limits are
 * evaluated per Cloudflare location) and must never be the only check.
 *
 * Fails CLOSED: if the binding itself errors (misconfiguration, an outage),
 * we deny rather than silently allow unlimited traffic through.
 */
export async function checkBurstLimit(
  binding: RateLimitBinding,
  key: string,
): Promise<{ allowed: boolean }> {
  try {
    const { success } = await binding.limit({ key });
    return { allowed: success };
  } catch (err) {
    log.error("ratelimit_binding_failed", { error: String(err) });
    return { allowed: false };
  }
}
