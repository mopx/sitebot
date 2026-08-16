import type {
  InboundMessage,
  MessageSource,
  SupportedLocale,
  Tenant,
  TurnStatus,
} from "@sitebot/shared";
import type { Generator } from "./generate.js";
import { GenerationError } from "./generate.js";
import type { Retriever } from "./retrieval.js";
import type { LeadSink } from "./leads.js";
import { buildSystemPrompt } from "./prompt.js";
import { deflectionCopy, fallbackCopy } from "./errors.js";
import { isGreeting, greetingCopy } from "./greeting.js";
import { log } from "../lib/log.js";

/** RPC-shaped view of ConversationDO — see durable/conversation.ts for the implementation. */
export interface ConversationRpc {
  beginTurn(
    eventId: string,
    text: string,
    opts: { maxPerDay: number; historyWindow: number; langHint?: SupportedLocale },
  ): Promise<TurnStatus>;
  completeTurn(assistantText: string, lang: SupportedLocale): Promise<void>;
  failTurn(): Promise<void>;
}

/** RPC-shaped view of BudgetDO — see durable/budget.ts for the implementation. */
export interface BudgetRpc {
  tryConsume(dailyCap: number): Promise<{ allowed: boolean }>;
  refund(): Promise<void>;
}

export interface PipelineDeps {
  retriever: Retriever;
  generator: Generator;
  conversation: ConversationRpc;
  budget: BudgetRpc;
  leadSink: LeadSink;
  tenant: Tenant;
  /** The ConversationDO's name (`${tenantId}:${channel}:${senderHash}` — see core/deps.ts#conversationKey). Threaded through only to tag captured leads with it. */
  conversationKey: string;
  maxPerDay: number;
  historyWindow: number;
  maxReplyTokens: number;
  budgetDailyCallCap: number;
}

export type TurnResult =
  | { kind: "ok"; text: string; sources: MessageSource[] }
  | { kind: "rate_limited"; retryAfterSec: number; text: string }
  | { kind: "at_capacity"; text: string }
  | { kind: "duplicate" };

/**
 * The single channel-agnostic entry point. WhatsApp, Telegram, and the web
 * widget all normalize into `InboundMessage` (shared/src/channel.ts) and call
 * this — see docs/ARCHITECTURE.md for why the pipeline never imports a
 * channel-specific type.
 */
export async function handleTurn(deps: PipelineDeps, inbound: InboundMessage): Promise<TurnResult> {
  const turn = await deps.conversation.beginTurn(inbound.eventId, inbound.text, {
    maxPerDay: deps.maxPerDay,
    historyWindow: deps.historyWindow,
    langHint: inbound.langHint,
  });

  if (turn.status === "duplicate") return { kind: "duplicate" };
  if (turn.status === "rate_limited") {
    return {
      kind: "rate_limited",
      retryAfterSec: turn.retryAfterSec,
      text: fallbackCopy(
        "rate_limited",
        inbound.langHint ?? deps.tenant.defaultLocale,
        deps.tenant.defaultLocale,
      ),
    };
  }

  const { history, lang } = turn;

  // A bare "hi"/"hola" has no question to ground in retrieved content —
  // see core/greeting.ts for why this needs to be its own path rather than
  // falling into the empty-chunks deflection below.
  if (isGreeting(inbound.text)) {
    const text = greetingCopy(deps.tenant, lang);
    await deps.conversation.completeTurn(text, lang);
    return { kind: "ok", text, sources: [] };
  }

  let chunks;
  try {
    chunks = await deps.retriever.retrieve(
      inbound.text,
      history.slice(0, -1).map((t) => t.content),
    );
  } catch (err) {
    log.error("retrieval_failed", { tenant: deps.tenant.slug, error: String(err) });
    await deps.conversation.failTurn();
    return {
      kind: "ok",
      text: fallbackCopy("retrieval_failed", lang, deps.tenant.defaultLocale),
      sources: [],
    };
  }

  // No relevant content: short-circuit before spending an LLM call — see
  // docs/ARCHITECTURE.md §RAG pipeline. Still counts as a completed turn
  // (not a failure), so it's stored in history like any other exchange.
  if (chunks.length === 0) {
    const text = deflectionCopy(deps.tenant, lang);
    await deps.conversation.completeTurn(text, lang);
    return { kind: "ok", text, sources: [] };
  }

  const budgetCheck = await deps.budget.tryConsume(deps.budgetDailyCallCap);
  if (!budgetCheck.allowed) {
    await deps.conversation.failTurn();
    return {
      kind: "at_capacity",
      text: fallbackCopy("at_capacity", lang, deps.tenant.defaultLocale),
    };
  }

  const systemPrompt = buildSystemPrompt({
    persona: deps.tenant,
    chunks,
    locale: lang,
    channel: inbound.channel,
  });

  try {
    const reply = await deps.generator.generate({
      systemPrompt,
      history,
      model: deps.tenant.claudeModel ?? "claude-haiku-4-5",
      maxTokens: deps.maxReplyTokens,
    });
    await deps.conversation.completeTurn(reply.text, lang);

    // Best-effort, never fails the turn — the person already has their
    // reply; losing the lead sink write shouldn't turn into a bad user
    // experience, just a logged gap for follow-up.
    if (reply.leadCapture) {
      await deps.leadSink
        .capture(reply.leadCapture, {
          tenantId: deps.tenant.id,
          channel: inbound.channel,
          conversationKey: deps.conversationKey,
        })
        .catch((err) => {
          log.error("lead_capture_failed", { tenant: deps.tenant.slug, error: String(err) });
        });
    }

    return { kind: "ok", text: reply.text, sources: chunks.map((c) => c.source) };
  } catch (err) {
    await deps.budget.refund();
    await deps.conversation.failTurn();
    const reason = err instanceof GenerationError ? err.message : String(err);
    log.error("generation_failed", { tenant: deps.tenant.slug, error: reason });
    return {
      kind: "ok",
      text: fallbackCopy("generation_failed", lang, deps.tenant.defaultLocale),
      sources: [],
    };
  }
}
