import type { InboundMessage } from "@sitebot/shared";

/**
 * Parses a Telegram `Update` object. Only plain `message.text` updates are
 * handled — `edited_message`, `channel_post`, and callback queries are
 * ignored. `update_id` is the dedup key (Telegram's own docs note it's
 * monotonic per bot but redelivery on retry is still possible).
 */
export function parseTelegramUpdate(rawBody: string): InboundMessage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const update = payload as Record<string, unknown>;

  const updateId = update["update_id"];
  const message = update["message"];
  if (typeof updateId !== "number" || typeof message !== "object" || message === null) return null;

  const msg = message as Record<string, unknown>;
  const text = msg["text"];
  const chat = msg["chat"];
  const date = msg["date"]; // Telegram sends unix seconds

  if (typeof text !== "string" || typeof chat !== "object" || chat === null) return null;
  const chatId = (chat as Record<string, unknown>)["id"];
  if (typeof chatId !== "number" && typeof chatId !== "string") return null;

  return {
    channel: "telegram",
    eventId: String(updateId),
    senderId: String(chatId),
    text,
    timestamp: typeof date === "number" ? date * 1000 : Date.now(),
  };
}
