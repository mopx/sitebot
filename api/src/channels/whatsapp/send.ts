import type { WhatsAppChannelConfig } from "@sitebot/shared";
import { log } from "../../lib/log.js";

const GRAPH_API_VERSION = "v21.0";
const MAX_MESSAGE_CHARS = 4000; // WhatsApp's own limit; our replies (max_tokens: 800) never get close.

/**
 * WhatsApp's "24-hour customer service window" only restricts *proactive*
 * (non-template) messages. This bot only ever replies to an inbound message,
 * so it is structurally always inside the window — see docs/WHATSAPP.md.
 */
export async function sendWhatsAppText(
  config: WhatsAppChannelConfig,
  to: string,
  text: string,
): Promise<void> {
  for (const chunk of splitMessage(text, MAX_MESSAGE_CHARS)) {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: chunk },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Never retry a bad-token/bad-request send loop — that's a cost vector
      // of its own. Log and move on; docs/WHATSAPP.md covers the common
      // Graph API error codes to look for here.
      log.error("whatsapp_send_failed", { status: response.status, body: body.slice(0, 500) });
      return;
    }
  }
}

export async function markWhatsAppMessageRead(
  config: WhatsAppChannelConfig,
  messageId: string,
): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      },
    );
  } catch (err) {
    log.warn("whatsapp_mark_read_failed", { error: String(err) });
  }
}

function splitMessage(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars));
  }
  return chunks;
}
