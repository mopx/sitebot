/**
 * The public contract of POST /api/chat — consumed by the web widget and any
 * other first-party client. Keeping it here (rather than duplicated in
 * web/src) is what stops the widget and the Worker from drifting apart.
 */

import type { MessageSource, SupportedLocale } from "./channel.js";

export interface ChatRequest {
  message: string;
  lang?: SupportedLocale;
}

export interface ChatResponseOk {
  reply: string;
  sources: MessageSource[];
  conversationId: string;
}

export interface ChatResponseError {
  error: "rate_limited" | "at_capacity" | "invalid_request" | "server_error";
  retryAfterSec?: number;
}

export type ChatResponse = ChatResponseOk | ChatResponseError;

export const CHAT_SESSION_HEADER = "x-chat-session";
