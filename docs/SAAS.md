# Multi-tenant (SaaS) mode

Set `TENANT_MODE: "multi"` in `wrangler.jsonc` to run one Worker as a small SaaS serving many
customers' bots, instead of one bot per deployment.

## What changes

|                               | `single` (default)                          | `multi`                                         |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Where a tenant's config lives | `config/persona.ts`, checked into the repo  | A row in D1 (`tenants` table)                   |
| Channel credentials           | Env secrets (`WHATSAPP_ACCESS_TOKEN`, etc.) | Encrypted in D1 (`tenant_channel_credentials`)  |
| Webhook/widget URLs           | `/webhooks/whatsapp`, `/api/chat`           | `/webhooks/whatsapp/<slug>`, `/api/chat/<slug>` |
| Managing tenants              | Edit a file, redeploy                       | `POST`/`PATCH` `/admin/tenants`                 |

Both modes implement the same `TenantStore` interface (`api/src/tenancy/tenant-store.ts`); nothing
else in the codebase branches on which one is active — every route resolves a `Tenant` and doesn't
know or care where it came from.

## Setup

```bash
npx wrangler d1 create sitebot-db
# copy the printed database_id into api/wrangler.jsonc's d1_databases block
pnpm --filter @sitebot/api db:migrate:remote

npx wrangler secret put ADMIN_API_KEY       # bearer token for /admin/*
npx wrangler secret put TENANT_SECRETS_KEY  # openssl rand -base64 32 — encrypts credentials at rest
```

Set `"TENANT_MODE": "multi"` in `wrangler.jsonc`, redeploy.

## The `/admin` API

Bearer-authenticated (`Authorization: Bearer <ADMIN_API_KEY>`). JSON only — there is no dashboard UI;
see "What's not included" below.

```bash
# Create a tenant
curl -X POST https://your-worker.example.com/admin/tenants \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{
    "slug": "acme",
    "status": "active",
    "botName": "Acme Assistant",
    "subjectName": "Acme Corp",
    "shortDescription": "Answers questions about Acme using acme.example.com.",
    "siteUrl": "https://acme.example.com",
    "supportedLocales": ["en"],
    "defaultLocale": "en",
    "systemPromptIntro": "You are the assistant for acme.example.com...",
    "fallbackMessage": { "en": "I do not have anything on the site about that yet." },
    "contactCta": { "en": "Reach out at hello@acme.example.com." },
    "aiSearchInstance": "acme-instance",
    "whatsapp": {
      "accessToken": "...", "phoneNumberId": "...", "appSecret": "...", "verifyToken": "..."
    }
  }'

# List tenants (credentials never included — see below)
curl https://your-worker.example.com/admin/tenants -H "Authorization: Bearer $ADMIN_API_KEY"

# Update a tenant (partial — only send what's changing)
curl -X PATCH https://your-worker.example.com/admin/tenants/<id> \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"botName": "Renamed Bot"}'

# Disconnect a channel (pass an explicit null for that channel's key)
curl -X PATCH https://your-worker.example.com/admin/tenants/<id> \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"whatsapp": null}'
```

Each tenant needs its **own** AI Search instance (`aiSearchInstance`) pointed at its own site — see
`docs/SETUP.md` §1 for creating one, repeated per tenant.

## Credential security

Channel credentials (WhatsApp access token, Telegram bot token, etc.) are AES-256-GCM encrypted
before they're written to D1, using the deployment-wide `TENANT_SECRETS_KEY` secret
(`api/src/lib/crypto.ts`). `GET /admin/tenants` (list) never returns decrypted credentials — only a
`whatsappConnected`/`telegramConnected` boolean. A single tenant's credentials are only ever decrypted
server-side, at the moment a webhook for that tenant needs them.

**Key rotation:** there's no automated rotation. To rotate `TENANT_SECRETS_KEY`, you'd decrypt every
row with the old key and re-encrypt with the new one in a one-off script — not currently built.

## What's NOT included (by design — this is infrastructure, not a product)

- **Billing / subscriptions.** No Stripe integration, no usage-based invoicing. `BudgetDO`'s per-tenant
  daily call cap (`wrangler.jsonc`'s `BUDGET_DAILY_CALL_CAP`, currently one value for every tenant —
  see `core/deps.ts` if you want it per-tenant) is a cost _ceiling_, not a billing meter. If you're
  charging customers, Stripe (or similar) is the natural next integration, reading `BudgetDO`'s
  counters or a new usage-tracking table as its data source.
- **Self-serve signup.** Tenants are created via the `/admin` API by whoever holds `ADMIN_API_KEY` —
  there's no public "create your bot" flow.
- **A dashboard UI.** `/admin` is a JSON API. A future web dashboard would call exactly these routes.
- **Per-tenant usage dashboards.** Workers Logs (structured JSON via `lib/log.ts`) and `BudgetDO`'s
  counters are the observability surface today.
