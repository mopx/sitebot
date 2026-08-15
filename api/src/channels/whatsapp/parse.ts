import type { InboundMessage } from "@sitebot/shared";
import { log } from "../../lib/log.js";

const STALE_MESSAGE_MS = 5 * 60 * 1000;

/**
 * Parses a Meta WhatsApp Cloud API webhook payload into zero or more
 * `InboundMessage`s. Never throws — malformed input, delivery-status
 * payloads, and unsupported message types all resolve to an empty (or
 * partially empty) result rather than a 500, since Meta will otherwise
 * retry a payload we can never successfully process.
 *
 * What's deliberately dropped, and why (see docs/WHATSAPP.md):
 *   - `value.statuses` (delivery/read receipts) — processing these as
 *     messages causes echo loops.
 *   - Non-text message types (image, audio, location, ...) — returned
 *     separately via `unsupportedCount` so the route can send one canned
 *     "text only" reply without spending an LLM call.
 *   - Messages older than 5 minutes — a stale retry after an outage; a
 *     3-day-late reply is worse than silence.
 */
export interface ParsedWhatsAppWebhook {
  messages: InboundMessage[];
  unsupportedSenders: string[];
}

export function parseWhatsAppWebhook(
  rawBody: string,
  now: number = Date.now(),
): ParsedWhatsAppWebhook {
  const result: ParsedWhatsAppWebhook = { messages: [], unsupportedSenders: [] };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return result;
  }

  const entries = getArray(payload, "entry");
  for (const entry of entries) {
    const changes = getArray(entry, "changes");
    for (const change of changes) {
      const value = getObject(change, "value");
      if (!value) continue;

      const messages = getArray(value, "messages");
      for (const message of messages) {
        const from = getString(message, "from");
        const id = getString(message, "id");
        const type = getString(message, "type");
        const timestampSec = getString(message, "timestamp");
        if (!from || !id) continue;

        const timestamp = timestampSec ? Number(timestampSec) * 1000 : now;
        if (Number.isFinite(timestamp) && now - timestamp > STALE_MESSAGE_MS) {
          log.warn("whatsapp_stale_message_dropped", { ageMs: now - timestamp });
          continue;
        }

        if (type !== "text") {
          result.unsupportedSenders.push(from);
          continue;
        }

        const text = getString(getObject(message, "text"), "body");
        if (!text) continue;

        result.messages.push({
          channel: "whatsapp",
          eventId: id,
          senderId: from,
          text,
          timestamp,
        });
      }
      // `value.statuses` (delivery/read receipts) is intentionally ignored — no branch needed.
    }
  }

  return result;
}

// Small, defensive accessors instead of a full zod schema for Meta's payload:
// the shape is deep and Meta adds fields over time, so we only reach for the
// handful of fields we use and treat anything else as absent.
function getObject(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const child = (value as Record<string, unknown>)[key];
  return typeof child === "object" && child !== null
    ? (child as Record<string, unknown>)
    : undefined;
}

function getArray(value: unknown, key: string): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null) return [];
  const child = (value as Record<string, unknown>)[key];
  return Array.isArray(child) ? (child as Record<string, unknown>[]) : [];
}

function getString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const child = value?.[key];
  return typeof child === "string" ? child : undefined;
}
