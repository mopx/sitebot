import { Hono } from "hono";
import type { Env } from "../env.js";
import { createTenantStore } from "../tenancy/tenant-store.js";
import { parseTelegramUpdate } from "../channels/telegram/parse.js";
import { sendTelegramText } from "../channels/telegram/send.js";
import { handleTurn } from "../core/pipeline.js";
import {
  buildPipelineDeps,
  conversationKey,
  getBudgetStub,
  getConversationStub,
} from "../core/deps.js";
import { timingSafeEqual } from "../lib/timingSafe.js";
import { log } from "../lib/log.js";

export const telegramRoute = new Hono<{ Bindings: Env }>();

/**
 * NOT ENABLED BY DEFAULT — see docs/TELEGRAM.md. The adapter (parse.ts,
 * send.ts) and this route are complete and tested; the bot stays inactive
 * for a tenant until that tenant has a `telegram` config (single-tenant
 * mode: TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET secrets; multi-tenant
 * mode: set via the /admin API). No route registration or code change is
 * needed to turn it on.
 */
telegramRoute.post("/webhooks/telegram/:tenant?", async (c) => {
  const env = c.env;
  const slug =
    c.req.param("tenant") ?? (env.TENANT_MODE === "single" ? env.SINGLE_TENANT_SLUG : undefined);
  if (!slug) return c.json({ error: "telegram_not_configured" }, 501);

  const tenant = await createTenantStore(env).getBySlug(slug);
  if (!tenant?.telegram || tenant.status !== "active") {
    return c.json({ error: "telegram_not_configured" }, 501);
  }

  // Telegram has no HMAC scheme — the documented mechanism is this header
  // plus a hard-to-guess webhook URL, set via `setWebhook`'s `secret_token`.
  const providedSecret = c.req.header("x-telegram-bot-api-secret-token");
  if (!providedSecret || !timingSafeEqual(providedSecret, tenant.telegram.webhookSecret)) {
    log.warn("telegram_secret_mismatch", { tenant: tenant.slug });
    return c.text("Unauthorized", 401);
  }

  const rawBody = await c.req.text();
  const inbound = parseTelegramUpdate(rawBody);

  // Ack fast, same rationale as WhatsApp — see docs/WHATSAPP.md; Telegram is
  // more forgiving about retries but there's no reason to hold the
  // connection open for a multi-second pipeline either way.
  if (inbound) {
    const telegramConfig = tenant.telegram;
    c.executionCtx.waitUntil(
      (async () => {
        const key = await conversationKey(env, tenant, "telegram", inbound.senderId);
        const conversation = getConversationStub(env, key);
        const budget = getBudgetStub(env, tenant);
        const deps = buildPipelineDeps(env, tenant, conversation, budget);

        const result = await handleTurn(deps, inbound);
        if (result.kind === "duplicate") return;

        await sendTelegramText(telegramConfig, inbound.senderId, result.text).catch((err) =>
          log.error("telegram_reply_send_failed", { tenant: tenant.slug, error: String(err) }),
        );
      })(),
    );
  }

  return c.text("OK", 200);
});
