/**
 * The Worker's binding + config surface. Kept hand-written (rather than
 * relying solely on `wrangler types`' generated `worker-configuration.d.ts`)
 * so this compiles and is reviewable before any Cloudflare resource exists.
 * Run `pnpm --filter @sitebot/api types` after real resources are created to
 * cross-check this against the generated types.
 */

// Minimal shape of the AI Search instance object returned by
// `env.AI_SEARCH.get(name)`. Only the methods this project uses are typed —
// see https://developers.cloudflare.com/ai-search/api/search/workers-binding/
// for the full surface.
export interface AiSearchChunk {
  id: string;
  text: string;
  score: number;
  item: { key: string; metadata?: Record<string, unknown> };
}

export interface AiSearchInstance {
  search(params: {
    messages: { role: "user" | "assistant"; content: string }[];
    ai_search_options?: {
      retrieval?: { max_num_results?: number; match_threshold?: number };
      query_rewrite?: Record<string, unknown>;
    };
  }): Promise<{ chunks: AiSearchChunk[] }>;
}

export interface AiSearchNamespaceBinding {
  get(instanceName: string): AiSearchInstance;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  // Bindings
  AI_SEARCH: AiSearchNamespaceBinding;
  DB: D1Database;
  CONVERSATION: DurableObjectNamespace;
  BUDGET: DurableObjectNamespace;
  RATE_LIMITER: RateLimitBinding;
  ASSETS: Fetcher;

  // Vars (wrangler.jsonc `vars`, or `.dev.vars` locally)
  TENANT_MODE: "single" | "multi";
  SINGLE_TENANT_SLUG: string;
  AI_SEARCH_INSTANCE: string;
  CLAUDE_MODEL: string;
  HISTORY_WINDOW_MESSAGES: string;
  RATE_LIMIT_PER_DAY_DEFAULT: string;
  RATE_LIMIT_PER_DAY_WEB: string;
  BUDGET_DAILY_CALL_CAP: string;
  RETRIEVAL_MAX_RESULTS: string;
  RETRIEVAL_MATCH_THRESHOLD: string;
  MAX_REPLY_TOKENS: string;
  ALLOWED_WEB_ORIGINS: string;

  // Secrets
  ANTHROPIC_API_KEY: string;
  SENDER_ID_SALT: string;
  ADMIN_API_KEY?: string;
  TENANT_SECRETS_KEY?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

function num(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Typed, defaulted reads of the numeric vars above — call sites never re-parse. */
export function tunables(env: Env) {
  return {
    historyWindowMessages: num(env.HISTORY_WINDOW_MESSAGES, 12),
    rateLimitPerDayDefault: num(env.RATE_LIMIT_PER_DAY_DEFAULT, 40),
    rateLimitPerDayWeb: num(env.RATE_LIMIT_PER_DAY_WEB, 25),
    budgetDailyCallCap: num(env.BUDGET_DAILY_CALL_CAP, 1500),
    retrievalMaxResults: num(env.RETRIEVAL_MAX_RESULTS, 5),
    retrievalMatchThreshold: num(env.RETRIEVAL_MATCH_THRESHOLD, 0.4),
    maxReplyTokens: num(env.MAX_REPLY_TOKENS, 800),
  };
}

export function allowedWebOrigins(env: Env): string[] {
  return env.ALLOWED_WEB_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
