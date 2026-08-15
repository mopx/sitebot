/**
 * Channel-agnostic message contracts. Every inbound surface (WhatsApp, Telegram,
 * the web widget, and any channel added later) normalizes into `InboundMessage`
 * before it reaches the core pipeline, and every reply leaves as `OutboundMessage`.
 * The pipeline (api/src/core/pipeline.ts) never imports a channel-specific type.
 */

export type ChannelId = "whatsapp" | "telegram" | "web";

export type SupportedLocale = "en" | "es" | "zh";

export interface InboundMessage {
  channel: ChannelId;
  /** Provider-unique id used as the dedup key (wamid, Telegram update_id, or a client-generated id for web). */
  eventId: string;
  /** Raw sender id (phone number, chat id, or web session id) — hashed before it touches storage. */
  senderId: string;
  text: string;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Only the web widget can supply this reliably (it knows the host page's locale). */
  langHint?: SupportedLocale;
}

export interface MessageSource {
  url: string;
  title?: string;
}

export interface OutboundMessage {
  channel: ChannelId;
  recipientId: string;
  text: string;
  sources?: MessageSource[];
}

// Note: "at_capacity" is NOT a ConversationDO outcome — that's the separate
// BudgetDO check the pipeline runs after this (see core/pipeline.ts). Keeping
// it out of this type means the pipeline's narrowing after a beginTurn() call
// is exhaustive without a dead branch.
export type TurnStatus =
  | { status: "ok"; history: ChatTurn[]; lang: SupportedLocale }
  | { status: "duplicate" }
  | { status: "rate_limited"; retryAfterSec: number };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

/** A single interface every channel implements, so the routes stay thin and interchangeable. */
export interface Channel {
  readonly id: ChannelId;
  /** Verify the request is authentic (signature / secret token). Never trust `parseIncoming` output otherwise. */
  verifyWebhook(
    rawBody: string,
    headers: Headers,
    secret: string,
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Pure parse: raw webhook body -> zero or more normalized messages. Never throws on malformed input. */
  parseIncoming(rawBody: string): InboundMessage[];
  /** Channel-specific formatting (markdown dialect, length limits) applied just before sending. */
  formatReply(text: string): string;
}
