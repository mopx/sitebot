# Setup

Everything in this file is a manual step — dashboard clicks, account creation, credential
generation. None of it can be automated from code, and an AI agent working in this repo should never
attempt to run `wrangler deploy` or create real Cloudflare/Meta resources without you explicitly
asking it to.

This file was written from a real deployment (jorgeyau.com, 2026-08-15) — every gotcha below actually
happened, not a hypothetical.

## 0. Prerequisites

- Node.js ≥ 20 for the repo itself, **but Wrangler's CLI requires Node ≥ 22** — a separate, higher
  bar than the Worker runtime it deploys to. If `npx wrangler <anything>` fails with "Wrangler
  requires at least Node.js v22.0.0", switch versions (`nvm install 22 && nvm use 22`) before
  continuing.
  - **If the repo has an `.nvmrc` pinning Node 20** (this one does, for the app itself) and your
    shell auto-switches on `cd` (nvm's `chpwd`/`autoload` hook), `nvm use 22` gets silently
    overridden the moment you `cd` into the repo — every subsequent `wrangler` call fails again with
    the same error even right after switching. Two ways around it: run `nvm use 22` **after** the
    `cd`, in the same command line, so it's the last thing to touch `PATH`; or skip the shell's
    `node`/`npx` resolution entirely and invoke the interpreter and entry point directly:
    `/path/to/nvm/versions/node/v22.x.x/bin/node node_modules/.pnpm/wrangler@.../node_modules/wrangler/wrangler-dist/cli.js <command> --cwd api`
    (note: `node_modules/.bin/wrangler` is a shell wrapper script, not JS — passing it straight to
    `node` throws a syntax error; use the real `wrangler-dist/cli.js` entry point instead).
- pnpm (`corepack enable` gets you the pinned version from `package.json`).
- A Cloudflare account. **If your login has access to more than one account** (common if you also
  manage other clients' Cloudflare through the same login), set `account_id` explicitly in
  `wrangler.jsonc` — every `wrangler` command otherwise prompts interactively to choose one, which
  silently picks a fallback default in non-interactive contexts (CI, an agent's shell) instead of
  asking. `wrangler whoami` lists your account IDs.
- An [Anthropic API key](https://console.anthropic.com/).
- If you're deploying for a site you don't own: get permission first — you're about to crawl it.

## 1. Cloudflare: AI Search instance

**Hard requirement:** the site you want indexed must be on the **same Cloudflare account** as the
Worker you're about to deploy. AI Search's website crawler can only index domains already onboarded
to your account.

**AI Search needs its own API token, separate from your Wrangler login.** The first
`wrangler ai-search create` call will fail with:

```
No AI Search API token found. Create one at:
  https://dash.cloudflare.com/<account_id>/ai/ai-search/tokens
```

Open that URL, create a token there (it's an account-level credential, not something you paste back
into the CLI), then re-run the command — Wrangler picks it up automatically once it exists.

```bash
npx wrangler login
npx wrangler ai-search create <instance-name> --type web-crawler --source https://your-site.example.com --parse-type discover
```

Or via the dashboard: **AI → AI Search → Create** → Website data source → your site's URL.

**Set `--parse-type discover`, not the default `sitemap`.** `sitemap` only indexes URLs listed in
`sitemap.xml` — if your site is a single-page app (or otherwise has a sparse sitemap), you'll end up
with a one-page index. `discover` follows links from the homepage instead — **but this only helps if
those links exist in the initial server-rendered HTML.** A client-side-rendered SPA (React/Next.js
app that mounts and routes entirely in JS) can still produce a **one-page index even with
`discover`**, because the crawler never executes JS to find the other routes. Check the real result
before assuming it worked — see the status check below.

**Checking whether it actually worked:** `wrangler ai-search get <name>` reports the instance's
steady state as `status: waiting` — this is the **idle-after-finishing** state, not "still working."
Don't wait for it to become "ready" or "active"; it never will. Use
`wrangler ai-search jobs list <name>` to see the actual sync job, then
`wrangler ai-search jobs logs <name> <job-id>` for a line like
`Finished indexing data source, got N pages/batches, M files seen` — that `M` is the real signal. If
`M` is 1 on a site with many real pages, the crawl was thin and you need the fallback below.

**Fallback for a thin crawl (SPAs, sparse sites): seed an R2-backed instance with curated Markdown
instead of relying on the web crawl.** There is no CLI command to add a second data source to an
existing instance, and no way to merge two instances' results at query time in this codebase (a
tenant has exactly one `aiSearchInstance`) — so if the web crawl is thin, replace it rather than
supplement it:

```bash
npx wrangler r2 bucket create <bucket-name>
# --remote is not optional here: without it, `wrangler r2 object put` writes to a local
# simulated bucket (used for `wrangler dev`), not the real one, and the upload silently
# "succeeds" without ever reaching production.
npx wrangler r2 object put <bucket-name>/profile.md --file docs/kb/your-profile.md --content-type "text/markdown" --remote
npx wrangler ai-search create <kb-instance-name> --type r2 --source <bucket-name>
```

Then point the tenant's `aiSearchInstance` at `<kb-instance-name>` (single-tenant: `AI_SEARCH_INSTANCE`
in `wrangler.jsonc`; multi-tenant: `PATCH /admin/tenants/:id` — see `docs/SAAS.md`). Write the seed
doc in plain language covering what you want the bot to reliably know — bio, services, availability
policy, contact info. See `docs/kb/` for the reference deployment's version — copy the shape, not the
content. It's fine to delete an unused thin web-crawler instance afterward
(`wrangler ai-search delete <name>`) — no cost/value in keeping it around.

```bash
npx wrangler ai-search search <instance-name> --query "test query"   # sanity check after any change
```

**Pre-launch checks** (all documented failure modes, not hypothetical):

- `robots.txt` on the target site has no [Content Signals](https://developers.cloudflare.com/ai-search/configuration/indexing/website/)
  directive setting `search=no` or `ai-input=no` for the AI Search crawler (`Cloudflare-AI-Search`) —
  either one rejects the crawl outright, distinct from a generic `Disallow`. A generic
  `Content-Signal: search=yes,ai-train=no,use=reference` with no `ai-input` entry is fine — the crawl
  is `ai-input`, not `ai-train`, and an unset signal is neither granted nor denied by design.
- No WAF / Bot Management rule on the zone blocks the crawler. Symptoms in the AI Search dashboard:
  `blocked_by_robots_txt`, `blocked_by_waf`, `blocked_by_bot_management` indexing error codes.
- After the first sync, check the instance's file count and any error codes (via `jobs logs`, see
  above) before assuming it worked.

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

**True secrets you already hold (API keys) should be typed directly into the interactive
`wrangler secret put` prompt by whoever holds them** — not piped through another process or pasted
into an agent's shell — so the value never lands in a log, a transcript, or shell history.

**Values you're generating fresh (`SENDER_ID_SALT`, `TENANT_SECRETS_KEY`, `ADMIN_API_KEY`) are safe to
pipe in** (`openssl rand -hex 32 | wrangler secret put NAME`), **but capture the value before or while
piping it** (`tee`, or generate-then-echo-then-pipe) if anything downstream needs to use it — e.g.
`ADMIN_API_KEY` is the bearer token for every `/admin/*` call afterward. Piped straight into
`wrangler secret put` with nothing capturing it, the value is never displayed anywhere and is
unrecoverable — Cloudflare stores secrets write-only, there's no "show secret" command. If this
happens, there's no fix except generating a new one and overwriting it (`wrangler secret put` on an
existing name just replaces it, no separate delete step needed).

The **first** `wrangler secret put` for a Worker that doesn't exist yet auto-creates a placeholder
Worker under that name — expected, not an error.

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

This step is entirely manual (Meta account/business verification, phone number ownership) — it's
reasonable to deploy and launch the web widget first, and add WhatsApp in a follow-up once you're
ready to do the Meta-side setup.

Full troubleshooting: `docs/WHATSAPP.md`.

## 5. (Multi-tenant/SaaS mode only) D1

```bash
npx wrangler d1 create sitebot-db
# copy the returned database_id into api/wrangler.jsonc's d1_databases block
pnpm --filter @sitebot/api db:migrate:remote
```

Then create the tenant itself (the D1 rows don't exist until you call the admin API — deploying the
Worker does not seed any tenant data):

```bash
curl -X POST https://your-worker.example.com/admin/tenants \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "slug": "your-slug", "status": "active", "botName": "...", ... }'
```

See `docs/SAAS.md` for the rest and the full field list.

## 6. Deploy

```bash
pnpm --filter @sitebot/web build   # builds the widget into api/public/widget.js
pnpm deploy                         # wrangler deploy
```

First deploy prints warnings that `workers_dev` and Preview URLs are being enabled by default because
neither is set explicitly in `wrangler.jsonc` — expected on a first deploy, not a failure. Add
`"workers_dev": false` (and a custom `routes` entry) once you've attached a real domain, if you don't
want the `*.workers.dev` URL to keep serving traffic alongside it.

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

- [ ] `wrangler ai-search jobs logs <instance-name> <job-id>` shows a realistic file count, not 1
      (see §1 if your site is a SPA)
- [ ] `wrangler ai-search search <instance-name> --query "..."` returns relevant chunks
- [ ] `GET /health` on your deployed Worker returns `{"ok": true, ...}`
- [ ] `POST /api/chat` (with an `x-chat-session` header) returns a grounded reply, not the "couldn't
      reach my notes" fallback
- [ ] A deliberately off-topic question gets the deflection message, not a hallucinated answer
- [ ] WhatsApp webhook verification succeeded in Meta's dashboard (green checkmark)
- [ ] A real WhatsApp message to your number gets a real reply
- [ ] The widget renders on your site and a message round-trips
- [ ] Run through `docs/EVAL.md`'s question checklist and record the results
