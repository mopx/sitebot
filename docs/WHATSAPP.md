# WhatsApp Cloud API

Account setup: `docs/SETUP.md` §4. This file covers the mechanics and troubleshooting.

## Why the official Cloud API, not an unofficial library

Libraries that automate the consumer WhatsApp app (e.g. Baileys-style approaches) violate WhatsApp's
Terms of Service and risk the number being banned with no appeal. The Cloud API (Meta-operated,
official, billed per conversation) is the only integration this project supports.

## The verification handshake

`GET /webhooks/whatsapp` (or `/webhooks/whatsapp/<tenant-slug>` in multi-tenant mode). Meta calls this
once, when you save the callback URL in the dashboard, with `hub.mode=subscribe`,
`hub.verify_token=<what you configured>`, and `hub.challenge=<random string>`. A match echoes the
challenge back as plain text with `200`; anything else returns `403` with no body — the submitted
token is never logged, even on mismatch.

## Signature verification — ordering matters

`POST /webhooks/whatsapp` verifies `X-Hub-Signature-256` before parsing or touching any storage
(`channels/whatsapp/signature.ts`). The signature is an HMAC-SHA256 of Meta's **exact raw bytes**,
using your `WHATSAPP_APP_SECRET`. The route reads the body as text (`c.req.text()`) before anything
else — parsing to JSON and re-serializing would not reproduce the same bytes, and the signature check
would fail on every request.

## Ack fast, process in the background

The route returns `200` immediately and does the actual work (retrieval, generation, sending the
reply) inside `c.executionCtx.waitUntil(...)`. This is the single most important detail here: Meta
retries a webhook delivery — with exponential backoff, for **up to ~7 days** — if it doesn't get a
prompt `2xx`. The full pipeline takes a few seconds; holding the connection open for it would mean
some fraction of deliveries time out and get redelivered. Dedup inside `ConversationDO` (keyed on the
message's `wamid`) is what makes the redeliveries that do land harmless rather than duplicate replies.

## What gets ignored, and why

- **`value.statuses`** (delivery/read receipts) — processing these as messages causes echo loops.
  Silently skipped, no branch needed.
- **Non-text messages** (image, audio, document, sticker, location, ...) — the bot sends one canned
  "I can only read text messages right now" reply per sender, in their resolved language, and never
  invokes the pipeline (no LLM cost for a photo).
- **Messages older than 5 minutes** — a stale retry after an outage. Replying to a message from three
  days ago is worse than not replying.

## The 24-hour customer service window

Meta only restricts _proactive_ (template) messages outside a 24-hour window since the user's last
inbound message. This bot only ever replies to something a user sent, so it is structurally always
inside the window — no message templates needed, and none are implemented.

## Debugging a webhook that isn't firing

- Meta's dashboard (WhatsApp → Configuration → your app) shows recent webhook delivery attempts and
  their response codes — check this first.
- Common Graph API error codes on send failures (`channels/whatsapp/send.ts` logs the status + body):
  `131047` (re-engagement/24h window issue — shouldn't happen here, see above, but check if it does),
  `131026` (message undeliverable — often an unregistered/invalid number), `100` (parameter problem —
  usually a malformed request; check the Graph API version in `send.ts` is still current).
- If verification (`GET`) fails: confirm `WHATSAPP_VERIFY_TOKEN` matches exactly what's in
  Cloudflare's secrets vs. what you typed into Meta's dashboard — a copy-paste trailing space is the
  most common cause.
- If signature verification (`POST`) fails for every message: confirm `WHATSAPP_APP_SECRET` is the
  **App Secret** (App Settings → Basic), not the access token — they're easy to mix up.

## Local testing

Meta requires a public HTTPS callback URL, so `localhost` alone doesn't work. Two options:

1. **A tunnel** (`cloudflared tunnel --url http://localhost:8787`) — fast iteration, but the URL
   changes every run, so you re-verify in Meta's dashboard each time.
2. **A separate `staging` Wrangler environment** with its own deployed Worker and its own Meta test
   app, pointed permanently at the staging URL. Slower to set up once, stable afterward — recommended
   for anything beyond the first hour of debugging.

## Token rotation

Permanent tokens (via a System User) don't expire on a fixed schedule but can be revoked. If a
deployed bot starts getting `401`s from the Graph API: generate a new token in Business Settings →
System Users, then `wrangler secret put WHATSAPP_ACCESS_TOKEN` (single-tenant) or update the tenant's
credentials via `/admin/tenants/:id` (multi-tenant, see `docs/SAAS.md`).
