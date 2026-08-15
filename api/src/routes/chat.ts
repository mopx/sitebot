import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { ChatResponse } from "@sitebot/shared";
import { CHAT_SESSION_HEADER } from "@sitebot/shared";
import type { Env } from "../env.js";
import { tunables, allowedWebOrigins } from "../env.js";
import { createTenantStore } from "../tenancy/tenant-store.js";
import { buildWebInboundMessage } from "../channels/web/adapter.js";
import { handleTurn } from "../core/pipeline.js";
import { checkBurstLimit } from "../lib/ratelimit.js";
import {
  buildPipelineDeps,
  conversationKey,
  getBudgetStub,
  getConversationStub,
} from "../core/deps.js";

export const chatRoute = new Hono<{ Bindings: Env }>();

chatRoute.use("/api/chat/*", (c, next) =>
  cors({ origin: allowedWebOrigins(c.env), allowHeaders: ["content-type", CHAT_SESSION_HEADER] })(
    c,
    next,
  ),
);
chatRoute.use("/api/chat", (c, next) =>
  cors({ origin: allowedWebOrigins(c.env), allowHeaders: ["content-type", CHAT_SESSION_HEADER] })(
    c,
    next,
  ),
);

const bodySchema = z.object({
  message: z.string().min(1).max(1000),
  lang: z.enum(["en", "es", "zh"]).optional(),
});

chatRoute.post("/api/chat/:tenant?", async (c) => {
  const env = c.env;
  const slug =
    c.req.param("tenant") ?? (env.TENANT_MODE === "single" ? env.SINGLE_TENANT_SLUG : undefined);
  if (!slug) {
    return c.json<ChatResponse>({ error: "invalid_request" }, 400);
  }

  const sessionId = c.req.header(CHAT_SESSION_HEADER);
  if (!sessionId) {
    return c.json<ChatResponse>({ error: "invalid_request" }, 400);
  }

  const parsedBody = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsedBody.success) {
    return c.json<ChatResponse>({ error: "invalid_request" }, 400);
  }

  const tenantStore = createTenantStore(env);
  const tenant = await tenantStore.getBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return c.json<ChatResponse>({ error: "invalid_request" }, 404);
  }

  // Web has no signature to verify, so burst-limit by client IP + session
  // together (rotating localStorage alone shouldn't reset the limit) — see
  // docs/ARCHITECTURE.md §Rate limiting.
  const clientIp = c.req.header("cf-connecting-ip") ?? "unknown";
  const burst = await checkBurstLimit(env.RATE_LIMITER, `web:${tenant.id}:${clientIp}`);
  if (!burst.allowed) {
    return c.json<ChatResponse>({ error: "rate_limited", retryAfterSec: 60 }, 429);
  }

  const inbound = buildWebInboundMessage({
    sessionId,
    message: parsedBody.data.message,
    lang: parsedBody.data.lang,
  });

  const key = await conversationKey(env, tenant, "web", sessionId);
  const conversation = getConversationStub(env, key);
  const budget = getBudgetStub(env, tenant);
  const deps = buildPipelineDeps(env, tenant, conversation, budget);
  deps.maxPerDay = tunables(env).rateLimitPerDayWeb;

  const result = await handleTurn(deps, inbound);

  if (result.kind === "duplicate") {
    return c.json<ChatResponse>({ error: "invalid_request" }, 409);
  }
  if (result.kind === "rate_limited") {
    return c.json<ChatResponse>(
      { error: "rate_limited", retryAfterSec: result.retryAfterSec },
      429,
    );
  }
  if (result.kind === "at_capacity") {
    return c.json<ChatResponse>({ error: "at_capacity" }, 503);
  }

  return c.json<ChatResponse>({ reply: result.text, sources: result.sources, conversationId: key });
});
