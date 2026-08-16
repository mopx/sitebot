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

/** A quick-reply chip. `send` is posted back exactly as if the visitor had typed it — no special server-side handling, just a shortcut through the normal pipeline. */
export interface ChatAction {
  label: string;
  send: string;
}

export interface ChatResponseOk {
  reply: string;
  sources: MessageSource[];
  conversationId: string;
  /** Quick replies to offer alongside this reply. Absent/empty = none. */
  actions?: ChatAction[];
  /** True when this turn's reply resulted from the model calling capture_lead with valid input. */
  leadCaptured?: boolean;
}

export interface ChatResponseError {
  error: "rate_limited" | "at_capacity" | "invalid_request" | "server_error";
  retryAfterSec?: number;
}

export type ChatResponse = ChatResponseOk | ChatResponseError;

export const CHAT_SESSION_HEADER = "x-chat-session";
