# CLAUDE.md

Guidance for AI agents (and future you) working in this repo.

## What this is

`sitebot` is a self-hostable AI chatbot — WhatsApp, Telegram (built, not yet wired on), and an
embeddable web widget — that answers questions grounded in one site's own content via Cloudflare AI
Search (RAG) and Claude. It can run as a single bot for one site (fork-and-deploy) or as a
multi-tenant SaaS serving many customers' bots from one Worker. The reference deployment
(`config/persona.ts`) is for jorgeyau.com; see `docs/ADAPTING.md` to repoint it elsewhere.

## Tech Stack

| Layer                  | Technology                                                           |
| ---------------------- | -------------------------------------------------------------------- |
| **Runtime**            | Cloudflare Workers (Hono)                                            |
| **LLM**                | Claude API, `claude-haiku-4-5` by default (`@anthropic-ai/sdk`)      |
| **Knowledge base**     | Cloudflare AI Search (RAG) — namespace binding, per-tenant instance  |
| **Conversation state** | Durable Objects (SQLite storage) — one per (tenant, channel, sender) |
| **Tenant registry**    | D1 (multi-tenant/SaaS mode only)                                     |
| **Rate limiting**      | Workers `ratelimits` binding + Durable Object quota counters         |
| **Web widget**         | Vanilla TypeScript custom element (Shadow DOM), esbuild → IIFE       |
| **Package manager**    | pnpm workspaces                                                      |
| **Testing**            | Vitest + `@cloudflare/vitest-pool-workers` (api), jsdom (web)        |

## Critical rules

**⚠️ DO NOT DEPLOY UNLESS EXPLICITLY INSTRUCTED.** Never run `wrangler deploy`, create real
Cloudflare resources (AI Search instances, D1 databases, KV/DO namespaces), or push to a remote git
repo on your own. Always wait for explicit user instruction.

**⚠️ Tests must never touch a real Cloudflare account.** `vitest.config.ts` points at
`wrangler.test.jsonc`, NOT `wrangler.jsonc` — that file deliberately omits the `ai_search_namespaces`
binding, because AI Search requires `remote: true` (a live, authenticated Cloudflare API session) and
running that during `vitest run` would reach a real account. Every test that needs retrieval results
injects a `StubRetriever` (`core/retrieval.ts`'s `Retriever` interface) instead. If you add a new
binding to `wrangler.jsonc`, mirror it in `wrangler.test.jsonc` too — unless, like AI Search, it can't
run locally, in which case keep it out and make sure nothing in `src/` requires it to be present for
the code paths under test.

**⚠️ Never hand-edit `worker-configuration.d.ts`.** It doesn't exist yet in this repo (no Cloudflare
resources have been created) — `api/src/env.ts` is hand-written and is the source of truth until real
resources exist. Once they do, run `pnpm --filter @sitebot/api types` and reconcile.

**⚠️ Never edit generated or installed files.** `node_modules/`, `dist/`, `.wrangler/`,
`api/public/widget.js` (build output — the source is `web/src/`), `pnpm-lock.yaml` conflicts — fix
the source and regenerate.

**Model-specific gotchas on `claude-haiku-4-5` (see `core/generate.ts`):**

- No `output_config.effort` — the parameter errors on this model.
- No `cache_control` on the system prompt — Haiku 4.5's minimum cacheable prefix is 4096 tokens; this
  prompt is far shorter, so a breakpoint would silently never cache.
- No `thinking` — a single grounded Q&A turn doesn't need it, and it isn't the point of this bot.

**Persona/site strings are never hardcoded in `src/`.** Everything specific to "Jorge" or
jorgeyau.com — name, site URL, fallback copy, contact CTA, supported languages — flows through
`BotPersona`/`Tenant` (see `shared/src/persona.ts`, `shared/src/tenant.ts`). If you're about to write
a literal name or URL into `api/src/`, it belongs in `config/persona.ts` (single-tenant) or a tenant
row (multi-tenant) instead.

## Commands

```bash
pnpm install                      # from repo root

pnpm dev                          # wrangler dev (api/), proxies AI Search to your real instance
pnpm --filter @sitebot/web dev    # serves web/demo/index.html for local widget testing
pnpm build                        # builds the widget, then type-checks the Worker
pnpm --filter @sitebot/web build  # widget only → api/public/widget.js

pnpm test                         # vitest watch, all packages
pnpm test:run                     # vitest run, all packages
pnpm --filter @sitebot/api test:run test/unit/core/pipeline.test.ts   # a single file

pnpm type-check                   # tsc --noEmit, all packages
pnpm lint                         # eslint .
pnpm validate                     # type-check + lint + test:run — run before every commit

pnpm --filter @sitebot/api db:migrate:local    # apply D1 migrations to the local dev binding
pnpm --filter @sitebot/api db:migrate:remote   # apply to the deployed D1 database

pnpm deploy                       # wrangler deploy — NEVER run without explicit instruction
```

## Architecture (short version — see docs/ARCHITECTURE.md for the full narrative + diagram)

```
WhatsApp/Telegram webhook  ─┐
Web widget (POST /api/chat)─┼─▶ verify (signature/secret/CORS) ─▶ resolve Tenant (by slug)
                             │        ─▶ ConversationDO.beginTurn (dedup + per-sender quota)
                             │        ─▶ Retriever.retrieve (AI Search, tenant's instance)
                             │        ─▶ [no results → deflect, no LLM call]
                             │        ─▶ BudgetDO.tryConsume (per-tenant daily cap)
                             │        ─▶ Generator.generate (Claude)
                             │        ─▶ ConversationDO.completeTurn
                             └────────▶ send reply (channel-specific)
```

Every channel (WhatsApp, Telegram, web) normalizes into `InboundMessage` and calls the same
`core/pipeline.ts#handleTurn` — the pipeline itself never imports a channel-specific type. See
`shared/src/channel.ts` for the `Channel`/`InboundMessage`/`OutboundMessage` contracts.

**Why a Durable Object per conversation, not D1:** a DO serializes every call to one conversation, so
two near-simultaneous webhook deliveries (Meta redelivering after a slow response) can't race on
read-modify-write history — dedup, quota, and history append happen as one atomic step for free. See
`docs/ARCHITECTURE.md` for the full comparison.

**Rate limiting is three layers, cheapest first:** a burst brake (`ratelimits` binding, eventually
consistent — never the only check), an exact per-sender daily quota (inside `ConversationDO`, because
it's serialized), and a per-tenant daily circuit breaker on Claude spend (`BudgetDO`). KV was
deliberately not used for this — the free tier's 1,000 writes/day would be exhausted by normal traffic
and the limiter would then fail open or error for everyone.

**Single-tenant vs multi-tenant (SaaS):** `TENANT_MODE` (`single` | `multi`, `wrangler.jsonc` var)
selects between `SingleTenantStore` (one `Tenant` built from `config/persona.ts` + env secrets — the
simple fork-and-deploy path) and `D1TenantStore` (tenants as D1 rows, channel credentials encrypted at
rest, managed via the `/admin/tenants` API). Both implement the same `TenantStore` interface
(`api/src/tenancy/tenant-store.ts`) — nothing else in the codebase needs to know which mode is active.
See `docs/SAAS.md`.

## Conventions

- TypeScript strict mode everywhere. `noUncheckedIndexedAccess` is on — array/object index access
  returns `T | undefined`; don't silence it with `!` unless you've actually just checked.
- Dependency injection for anything that costs money or can't run locally: `Retriever` (AI Search),
  `Generator` (Claude), `ConversationRpc`/`BudgetRpc` (DO stubs, typed as RPC interfaces — see
  `core/pipeline.ts`). Never have `core/pipeline.ts` reach for a binding directly.
- User-facing failure copy lives in exactly one place per kind: `core/errors.ts` (generic failures,
  per locale) and the tenant's own `fallbackMessage`/`contactCta` (the "I don't know" deflection).
  Never inline a user-facing string in a route or channel adapter.
- Conventional commits, subject line ≤ 72 chars. Body only when the _why_ isn't obvious from the
  diff. Never a bullet-list commit body. Never bypass commit signing.
- All tests must pass before committing — no "pre-existing failure" exceptions. If you touch a
  schema, an API shape, or a Zod schema, update its tests in the same change.
- Prefer well-maintained npm packages over custom implementations, but don't reach for one where the
  platform already provides it (`crypto.randomUUID()`, `crypto.subtle`, `fetch`).
- No emoji in code, commit messages, or docs (the widget's launcher button emoji is the one
  deliberate UI exception).

## Testing

- **Unit** (`api/test/unit/`): pure logic — signature verification, webhook payload parsing, hashing,
  locale resolution, prompt assembly, and the full pipeline via `core/pipeline.test.ts` (stubbed
  retriever/generator/DO RPCs — this is the highest-value test in the repo, since it exercises every
  dedup/rate-limit/budget/failure branch without any I/O).
- **Integration** (`api/test/integration/`): `ConversationDO`/`BudgetDO` via real (local) Durable
  Object bindings, `D1TenantStore` via a real (local) D1 binding, and HTTP routes via `SELF.fetch` —
  all fully local, no credentials needed. The chat/webhook route tests deliberately rely on
  `wrangler.test.jsonc` having no `AI_SEARCH` binding, which makes retrieval fail _the same way every
  time_ (a caught, graceful fallback) rather than either succeeding unpredictably or requiring a real
  account.
- **Explicitly out of scope for automated tests:** real calls to the Graph API, Telegram Bot API,
  Anthropic API, or AI Search, and retrieval _quality_. See `docs/EVAL.md` for the manual eval
  checklist that covers what automated tests structurally cannot.

## Env vars & secrets

See `api/.dev.vars.example` (local dev) and the comment block at the bottom of `api/wrangler.jsonc`
(production, set via `wrangler secret put`) for the full list and which mode each one is required in.

## Further reading

- [`README.md`](README.md) — what this is, for someone finding the repo
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — full data flow, every design decision and why
- [`docs/SETUP.md`](docs/SETUP.md) — Cloudflare + Meta/WhatsApp manual setup, step by step
- [`docs/SAAS.md`](docs/SAAS.md) — multi-tenant mode, the `/admin` API, what's NOT included (billing)
- [`docs/ADAPTING.md`](docs/ADAPTING.md) — forking this for a different site/persona
- [`docs/WHATSAPP.md`](docs/WHATSAPP.md) / [`docs/TELEGRAM.md`](docs/TELEGRAM.md) — per-channel detail
- [`docs/EVAL.md`](docs/EVAL.md) — manual answer-quality checklist (not automatable)
