import type { ChatRequest, ChatResponse } from "@sitebot/shared";
import { CHAT_SESSION_HEADER } from "@sitebot/shared";

export interface ChatClientOptions {
  apiUrl: string;
  tenant?: string;
  sessionId: string;
}

export async function sendChatMessage(
  options: ChatClientOptions,
  request: ChatRequest,
): Promise<ChatResponse> {
  const path = options.tenant ? `/api/chat/${encodeURIComponent(options.tenant)}` : "/api/chat";
  const response = await fetch(`${options.apiUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [CHAT_SESSION_HEADER]: options.sessionId,
    },
    body: JSON.stringify(request),
  });

  const body = (await response.json().catch(() => null)) as ChatResponse | null;
  if (!body) {
    return { error: "server_error" };
  }
  return body;
}
