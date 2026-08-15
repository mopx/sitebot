# sitebot

> **AI-generated code notice:** This project was generated with the assistance of AI tools.
> Review the source carefully before using it in production, and test against a sandbox
> environment before going live.

A self-hostable AI chatbot that answers questions grounded in your own site's content —
over WhatsApp, Telegram, and an embeddable web widget. Runs on Cloudflare Workers.

- **Grounded, not hallucinated.** Every answer is retrieved from your site via [Cloudflare AI
  Search](https://developers.cloudflare.com/ai-search/) before Claude ever sees the question. No
  matching content → the bot says so and points people to a real contact, instead of guessing.
- **Cheap by default.** Cloudflare's free tier (Workers, Durable Objects, AI Search) plus
  `claude-haiku-4-5` keeps a low-traffic personal-site bot close to $0/month. See
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the cost/rate-limiting design.
- **One bot or many.** Fork it and deploy your own single bot (`TENANT_MODE=single`), or run it as a
  small SaaS serving multiple customers' bots from one Worker (`TENANT_MODE=multi`, tenants in D1,
  managed via a JSON `/admin` API). See [`docs/SAAS.md`](docs/SAAS.md).
- **WhatsApp today, Telegram when you want it.** The Telegram adapter is fully built and tested; it
  just isn't turned on until you set its two secrets — see [`docs/TELEGRAM.md`](docs/TELEGRAM.md).

## How it works

```
Your site  ──crawled by──▶  AI Search (RAG index)
                                   │
WhatsApp / Telegram / Web widget ─▶ Worker ─▶ retrieve context ─▶ Claude ─▶ reply
```

Full data-flow diagram and every design decision (and why): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quickstart

Requires a Cloudflare account, an Anthropic API key, and (for WhatsApp) a Meta Business account.
None of the steps below are automatable from code — walk through
[`docs/SETUP.md`](docs/SETUP.md) for the full sequence. Short version:

```bash
git clone <this-repo> my-bot && cd my-bot
pnpm install

cp config/persona.example.ts config/persona.ts   # edit for your site — see docs/ADAPTING.md
cp api/.dev.vars.example api/.dev.vars            # fill in ANTHROPIC_API_KEY, etc.

# Create your Cloudflare resources (AI Search instance, D1 if using SaaS mode) — docs/SETUP.md
pnpm --filter @sitebot/api dev                    # local dev, http://localhost:8787

pnpm --filter @sitebot/web build                  # builds the embeddable widget
pnpm deploy                                        # wrangler deploy, when you're ready
```

Embed the widget on your own site with one script tag:

```html
<script
  defer
  src="https://your-worker.example.com/widget.js"
  data-api="https://your-worker.example.com"
  data-lang="en"
  data-bot-name="Your Assistant"
></script>
```

## Repo layout

```
sitebot/
├── api/       # the Hono Worker — routes, RAG pipeline, Durable Objects, tenant registry
├── web/       # the embeddable chat widget (vanilla TS, builds to api/public/widget.js)
├── shared/    # types shared between api/ and web/ (message contracts, persona config shape)
├── config/    # persona.ts — the one file a fork edits to retarget this bot at a different site
└── docs/      # setup, architecture, per-channel and per-mode guides
```

## Documentation

|                                                |                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| [`docs/SETUP.md`](docs/SETUP.md)               | Cloudflare + WhatsApp setup, step by step, with a launch checklist           |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Data flow, every design decision, and why                                    |
| [`docs/ADAPTING.md`](docs/ADAPTING.md)         | Forking this repo for a different site or persona                            |
| [`docs/SAAS.md`](docs/SAAS.md)                 | Multi-tenant mode, the `/admin` API, what's not included                     |
| [`docs/WHATSAPP.md`](docs/WHATSAPP.md)         | Meta app setup, webhook debugging, common error codes                        |
| [`docs/TELEGRAM.md`](docs/TELEGRAM.md)         | Enabling the (already built, already tested) Telegram bot                    |
| [`docs/EVAL.md`](docs/EVAL.md)                 | Manual answer-quality checklist                                              |
| [`CLAUDE.md`](CLAUDE.md)                       | Conventions and critical rules for anyone (human or AI) working in this repo |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)           | Local dev setup, testing, PR process                                         |

## License

[MIT](LICENSE)
