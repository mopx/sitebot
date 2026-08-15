import type { InboundMessage, SupportedLocale } from "@sitebot/shared";

/**
 * Not a webhook — the web widget calls POST /api/chat directly and gets its
 * reply as the HTTP response, so there's no separate "send" step to
 * implement (unlike WhatsApp/Telegram). This just builds the InboundMessage.
 */
export function buildWebInboundMessage(input: {
  sessionId: string;
  message: string;
  lang?: SupportedLocale;
}): InboundMessage {
  return {
    channel: "web",
    // Web has no provider-assigned message id, so we derive one — same
    // session + same text within the same minute collapses to one dedup
    // key, which is the right behavior for an accidental double-submit.
    eventId: `${input.sessionId}:${Math.floor(Date.now() / 60_000)}:${hashText(input.message)}`,
    senderId: input.sessionId,
    text: input.message,
    timestamp: Date.now(),
    langHint: input.lang,
  };
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}
