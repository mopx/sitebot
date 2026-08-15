import type { TelegramChannelConfig } from "@sitebot/shared";
import { log } from "../../lib/log.js";

export async function sendTelegramText(
  config: TelegramChannelConfig,
  chatId: string,
  text: string,
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log.error("telegram_send_failed", { status: response.status, body: body.slice(0, 500) });
  }
}
