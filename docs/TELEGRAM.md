# Telegram

> **Not enabled by default.** The adapter (`channels/telegram/`) and its route
> (`routes/telegram.ts`) are complete and fully tested — see
> `api/test/unit/channels/telegram/`. A tenant's Telegram bot stays inactive until that tenant has
> Telegram credentials configured. No code change or route registration is needed to turn it on —
> just the two values below.

## Why it was built this way

Every channel (WhatsApp, web, Telegram) implements the same `Channel`-shaped contract
(`shared/src/channel.ts`) and calls the same `core/pipeline.ts#handleTurn`. Building the Telegram
adapter alongside WhatsApp — rather than only sketching an interface — is what proves that contract is
real: if Telegram needed pipeline changes to work, the abstraction would have been wrong.

## Enabling it

### Single-tenant mode

1. Message [@BotFather](https://t.me/BotFather) on Telegram, `/newbot`, follow the prompts. You get a
   bot token (`123456:ABC-...`).
2. Invent a random secret string (`openssl rand -hex 32`) — this is `TELEGRAM_WEBHOOK_SECRET`,
   Telegram's substitute for a signature scheme (see below).
3. Set both secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   ```
4. Redeploy (`pnpm deploy`), then register the webhook:
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://your-worker.example.com/webhooks/telegram" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     -d "allowed_updates=[\"message\"]"
   ```

### Multi-tenant (SaaS) mode

Set the tenant's `telegram` credentials via `PATCH /admin/tenants/:id` (see `docs/SAAS.md`), then
register the webhook exactly as above but pointed at `/webhooks/telegram/<tenant-slug>`.

## How verification works

Telegram has no HMAC signature scheme like WhatsApp's. The documented mechanism is: an
unguessable webhook URL, plus the `secret_token` you set on `setWebhook`, which Telegram echoes back
on every delivery as the `X-Telegram-Bot-Api-Secret-Token` header. The route rejects any request
where that header doesn't match (constant-time compare, `lib/timingSafe.ts`).

## What gets ignored

Only `message.text` updates are handled. `edited_message`, `channel_post`, and callback queries are
ignored — see `channels/telegram/parse.ts`. `update_id` (not `message_id`) is the dedup key.

## Ack behavior

Same rationale as WhatsApp (`docs/WHATSAPP.md`): the route returns `200` immediately and processes
in `waitUntil`. Telegram is more forgiving about retry timing than Meta, but there's no reason to hold
the connection open for a multi-second pipeline either way.
