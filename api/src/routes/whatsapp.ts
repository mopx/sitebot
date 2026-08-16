import { Hono } from "hono";
import type { Env } from "../env.js";
import { createTenantStore } from "../tenancy/tenant-store.js";
import { verifyWhatsAppSignature } from "../channels/whatsapp/signature.js";
import { parseWhatsAppWebhook } from "../channels/whatsapp/parse.js";
import { markWhatsAppMessageRead, sendWhatsAppText } from "../channels/whatsapp/send.js";
import { handleTurn } from "../core/pipeline.js";
import {
  buildPipelineDeps,
  conversationKey,
  getBudgetStub,
  getConversationStub,
} from "../core/deps.js";
import { fallbackCopy } from "../core/errors.js";
import { timingSafeEqual } from "../lib/timingSafe.js";
import { log } from "../lib/log.js";
import type { Tenant, WhatsAppChannelConfig } from "@sitebot/shared";

export const whatsappRoute = new Hono<{ Bindings: Env }>();

/**
 * Verification handshake — Meta calls this once when you register the
 * callback URL. `hub.mode=subscribe` + a matching `hub.verify_token` ->
 * echo `hub.challenge` back as plain text. Anything else -> 403, no body
 * (never log the submitted token).
 */
whatsappRoute.get("/webhooks/whatsapp/:tenant?", async (c) => {
  const env = c.env;
  const slug =
    c.req.param("tenant") ?? (env.TENANT_MODE === "single" ? env.SINGLE_TENANT_SLUG : undefined);
  const tenant = slug ? await createTenantStore(env).getBySlug(slug) : null;

  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (!tenant?.whatsapp || mode !== "subscribe" || !token || !challenge) {
    return c.text("Forbidden", 403);
  }
  if (!timingSafeEqual(token, tenant.whatsapp.verifyToken)) {
    return c.text("Forbidden", 403);
  }
  return c.text(challenge, 200);
});

/**
 * Inbound messages. Ordering here is load-bearing — see docs/WHATSAPP.md:
 *   1. Read the raw body as TEXT before anything else (the signature is over
 *      Meta's exact bytes; re-serialized JSON will not match).
 *   2. Verify the signature before parsing or touching any storage.
 *   3. Return 200 immediately; do the actual work in `waitUntil` — Meta
 *      retries (for up to ~7 days) if it doesn't get a fast 2xx, and our
 *      pipeline (retrieval + a Claude call + a Graph API send) takes
 *      several seconds. Dedup inside ConversationDO is what makes the
 *      retries that do land safe.
 */
whatsappRoute.post("/webhooks/whatsapp/:tenant?", async (c) => {
  const env = c.env;
  const slug =
    c.req.param("tenant") ?? (env.TENANT_MODE === "single" ? env.SINGLE_TENANT_SLUG : undefined);
  if (!slug) return c.text("Not found", 404);

  const tenant = await createTenantStore(env).getBySlug(slug);
  if (!tenant?.whatsapp || tenant.status !== "active") return c.text("Not found", 404);

  const rawBody = await c.req.text();
  const signatureHeader = c.req.header("x-hub-signature-256") ?? null;
  const verified = await verifyWhatsAppSignature(
    rawBody,
    signatureHeader,
    tenant.whatsapp.appSecret,
  );
  if (!verified) {
    log.warn("whatsapp_signature_mismatch", { tenant: tenant.slug });
    return c.text("Unauthorized", 401);
  }

  const parsed = parseWhatsAppWebhook(rawBody);
  const tenantWithWhatsApp = tenant as Tenant & { whatsapp: WhatsAppChannelConfig };

  c.executionCtx.waitUntil(processWhatsAppMessages(env, tenantWithWhatsApp, parsed));

  return c.text("OK", 200);
});

async function processWhatsAppMessages(
  env: Env,
  tenant: Tenant & { whatsapp: WhatsAppChannelConfig },
  parsed: ReturnType<typeof parseWhatsAppWebhook>,
): Promise<void> {
  for (const from of parsed.unsupportedSenders) {
    const text = fallbackCopy(
      "unsupported_message_type",
      tenant.defaultLocale,
      tenant.defaultLocale,
    );
    await sendWhatsAppText(tenant.whatsapp, from, text).catch((err) =>
      log.error("whatsapp_reply_send_failed", { tenant: tenant.slug, error: String(err) }),
    );
  }

  for (const inbound of parsed.messages) {
    await markWhatsAppMessageRead(tenant.whatsapp, inbound.eventId).catch(() => undefined);

    const key = await conversationKey(env, tenant, "whatsapp", inbound.senderId);
    const conversation = getConversationStub(env, key);
    const budget = getBudgetStub(env, tenant);
    const deps = buildPipelineDeps(env, tenant, conversation, budget, key);

    const result = await handleTurn(deps, inbound);
    if (result.kind === "duplicate") continue;

    await sendWhatsAppText(tenant.whatsapp, inbound.senderId, result.text).catch((err) =>
      log.error("whatsapp_reply_send_failed", { tenant: tenant.slug, error: String(err) }),
    );
  }
}
