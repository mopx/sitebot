# Setup

Everything in this file is a manual step — dashboard clicks, account creation, credential
generation. None of it can be automated from code, and an AI agent working in this repo should never
attempt to run `wrangler deploy` or create real Cloudflare/Meta resources without you explicitly
asking it to.

## 0. Prerequisites

- Node.js ≥ 20, pnpm (`corepack enable` gets you the pinned version from `package.json`).
- A Cloudflare account.
- An [Anthropic API key](https://console.anthropic.com/).
- If you're deploying for a site you don't own: get permission first — you're about to crawl it.

## 1. Cloudflare: AI Search instance

**Hard requirement:** the site you want indexed must be on the **same Cloudflare account** as the
Worker you're about to deploy. AI Search's website crawler can only index domains already onboarded
to your account.

```bash
npx wrangler login
npx wrangler ai-search create <instance-name> --type web-crawler --source https://your-site.example.com
```

Or via the dashboard: **AI → AI Search → Create** → Website data source → your site's URL.

**Set the parse type to `discover`, not the default `sitemap`.** `sitemap` only indexes URLs listed
in `sitemap.xml` — if your site is a single-page app (or otherwise has a sparse sitemap), you'll end
up with a one-page index. `discover` follows links from the homepage instead.

**Seed it with a curated knowledge document.** Even with `discover`, a thin site produces a thin
index. Write a plain-language Markdown doc covering what you want the bot to reliably know — bio,
services, availability policy, contact info — and upload it as an item:

```bash
npx wrangler ai-search search <instance-name> --query "test query"   # sanity check after any change
```

See `docs/kb/` for the reference deployment's seed document — copy the shape, not the content.

**Pre-launch checks** (all documented failure modes, not hypothetical):

- `robots.txt` on the target site has no [Content Signals](https://developers.cloudflare.com/ai-search/configuration/indexing/website/)
  directive setting `search=no` or `ai-input=no` for the AI Search crawler (`Cloudflare-AI-Search`) —
  either one rejects the crawl outright, distinct from a generic `Disallow`.
- No WAF / Bot Management rule on the zone blocks the crawler. Symptoms in the AI Search dashboard:
  `blocked_by_robots_txt`, `blocked_by_waf`, `blocked_by_bot_management` indexing error codes.
- After the first sync, check the instance's file count and any error codes in the dashboard before
  assuming it worked.

Update `AI_SEARCH_INSTANCE` in `wrangler.jsonc` (single-tenant mode) to match the instance name you
created.

## 2. Persona config

```bash
cp config/persona.example.ts config/persona.ts   # if you haven't already customized it
```

Fill in every field — see `docs/ADAPTING.md` for what each one does and how it reaches the bot's
replies.

## 3. Secrets

Local dev: copy `api/.dev.vars.example` to `api/.dev.vars` and fill in. `wrangler dev` loads it
automatically; it's gitignored.

Production:

```bash
cd api
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put SENDER_ID_SALT        # any random string — openssl rand -hex 32
# Single-tenant mode only (skip if TENANT_MODE=multi):
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WHATSAPP_VERIFY_TOKEN  # any random string you choose
# Multi-tenant (SaaS) mode only — see docs/SAAS.md:
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put TENANT_SECRETS_KEY     # openssl rand -base64 32
```

## 4. WhatsApp Cloud API (Meta)

1. Create a **Meta Business Portfolio** at [business.facebook.com](https://business.facebook.com) if
   you don't have one.
2. Create a **Meta App** (type: Business) and add the **WhatsApp** product.
3. In WhatsApp → API Setup, either use the provided **test number** (dev only — limited to 5
   pre-registered recipients) or add a real phone number.
   **A number already registered to the consumer WhatsApp app or WhatsApp Business app must be
   removed from that app first** — it can't be active on both.
4. Copy the **Phone number ID** (not the phone number itself) → `WHATSAPP_PHONE_NUMBER_ID`.
5. The token shown in API Setup is a 24-hour dev token — it will expire mid-testing. Generate a
   **permanent** one instead: Business Settings → System Users → create one → assign the App and the
   WhatsApp Business Account as assets → generate a token with `whatsapp_business_messaging` and
   `whatsapp_business_management` scopes → `WHATSAPP_ACCESS_TOKEN`.
6. App Settings → Basic → copy the **App Secret** → `WHATSAPP_APP_SECRET`.
7. Invent a random string for `WHATSAPP_VERIFY_TOKEN` (`openssl rand -hex 32`).
8. **Deploy the Worker first** (step 6 below), then in WhatsApp → Configuration set:
   - Callback URL: `https://your-worker.example.com/webhooks/whatsapp` (single-tenant) or
     `.../webhooks/whatsapp/<tenant-slug>` (multi-tenant)
   - Verify token: the value you set for `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and Save**.
9. **Subscribe to the `messages` field only.** Subscribing to everything produces a lot of noise the
   bot ignores anyway (delivery receipts, etc.).
10. Unverified Business accounts have a low messaging-limit tier; Business verification raises it.
    Not required to get started, worth doing before real traffic.
11. Double-check Meta's current per-conversation pricing for your target country before assuming any
    particular free allowance — this has changed more than once.

Full troubleshooting: `docs/WHATSAPP.md`.

## 5. (Multi-tenant/SaaS mode only) D1

```bash
npx wrangler d1 create sitebot-db
# copy the returned database_id into api/wrangler.jsonc's d1_databases block
pnpm --filter @sitebot/api db:migrate:remote
```

See `docs/SAAS.md` for the rest.

## 6. Deploy

```bash
pnpm --filter @sitebot/web build   # builds the widget into api/public/widget.js
pnpm deploy                         # wrangler deploy
```

## 7. Add the widget to your site

```html
<script
  defer
  src="https://your-worker.example.com/widget.js"
  data-api="https://your-worker.example.com"
  data-lang="en"
  data-bot-name="Your Assistant"
></script>
```

`data-tenant="<slug>"` is required in multi-tenant mode, omit it in single-tenant mode.

## Launch checklist

- [ ] `wrangler ai-search search <instance-name> --query "..."` returns relevant chunks
- [ ] `GET /health` on your deployed Worker returns `{"ok": true, ...}`
- [ ] `POST /api/chat` (with an `x-chat-session` header) returns a grounded reply, not the "couldn't
      reach my notes" fallback
- [ ] WhatsApp webhook verification succeeded in Meta's dashboard (green checkmark)
- [ ] A real WhatsApp message to your number gets a real reply
- [ ] The widget renders on your site and a message round-trips
- [ ] Run through `docs/EVAL.md`'s question checklist and record the results
