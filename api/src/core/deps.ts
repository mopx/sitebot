import type { ChannelId, Tenant } from "@sitebot/shared";
import type { Env } from "../env.js";
import { tunables } from "../env.js";
import { AiSearchRetriever } from "./retrieval.js";
import { ClaudeGenerator } from "./generate.js";
import { AsanaHttpClient, D1LeadSink, NoopAsanaClient, type AsanaClient } from "./leads.js";
import { hashSenderId } from "../lib/hash.js";
import type { ConversationRpc, BudgetRpc, PipelineDeps } from "./pipeline.js";

/** `${tenantId}:${channel}:${senderHash}` — the ConversationDO's identity. Never the raw sender id. */
export async function conversationKey(
  env: Env,
  tenant: Tenant,
  channel: ChannelId,
  rawSenderId: string,
): Promise<string> {
  const senderHash = await hashSenderId(env.SENDER_ID_SALT, rawSenderId);
  return `${tenant.id}:${channel}:${senderHash}`;
}

// Cast straight to the RPC-shaped interface (Promise-returning), not to the
// concrete DO class (whose methods are written synchronously — see
// durable/conversation.ts). The Workers RPC layer wraps every call in a
// Promise at runtime regardless of the class's own method signatures; the
// interfaces in core/pipeline.ts describe the wire contract, which is what
// callers actually see.
export function getConversationStub(env: Env, key: string): ConversationRpc {
  const id = env.CONVERSATION.idFromName(key);
  return env.CONVERSATION.get(id) as unknown as ConversationRpc;
}

export function getBudgetStub(env: Env, tenant: Tenant): BudgetRpc {
  const id = env.BUDGET.idFromName(tenant.id);
  return env.BUDGET.get(id) as unknown as BudgetRpc;
}

/** ASANA_ACCESS_TOKEN/ASANA_PROJECT_GID are optional — see .dev.vars.example. Without them, leads still land in D1, just without the Asana push. */
function buildAsanaClient(env: Env): AsanaClient {
  if (!env.ASANA_ACCESS_TOKEN || !env.ASANA_PROJECT_GID) return new NoopAsanaClient();
  return new AsanaHttpClient(env.ASANA_ACCESS_TOKEN, env.ASANA_PROJECT_GID);
}

export function buildPipelineDeps(
  env: Env,
  tenant: Tenant,
  conversation: ConversationRpc,
  budget: BudgetRpc,
  conversationKey: string,
): PipelineDeps {
  const t = tunables(env);
  return {
    tenant,
    conversation,
    budget,
    conversationKey,
    leadSink: new D1LeadSink(env.DB, buildAsanaClient(env)),
    retriever: new AiSearchRetriever(env.AI_SEARCH, tenant.aiSearchInstance, {
      maxNumResults: t.retrievalMaxResults,
      matchThreshold: t.retrievalMatchThreshold,
    }),
    generator: new ClaudeGenerator(env.ANTHROPIC_API_KEY),
    maxPerDay: t.rateLimitPerDayDefault,
    historyWindow: t.historyWindowMessages,
    maxReplyTokens: t.maxReplyTokens,
    budgetDailyCallCap: t.budgetDailyCallCap,
  };
}
