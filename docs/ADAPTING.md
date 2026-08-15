# Adapting this for a different site

Everything specific to "Jorge" or jorgeyau.com flows through one file (single-tenant mode) or one D1
row (multi-tenant mode) — nothing in `api/src/` hardcodes a name, URL, or piece of contact info. That
separation is enforced by convention (see `CLAUDE.md`), not by a plugin system — this is still a
small personal-site bot, and the goal is "a stranger can retarget it by editing one file," not a
general-purpose platform.

## Single-tenant fork (the common case)

```bash
cp config/persona.example.ts config/persona.ts
```

Fill in every field:

| Field                                | What it controls                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `botName`                            | Widget header, WhatsApp "who is this" context                                           |
| `subjectName`                        | Who the bot talks _about_, third person — see `docs/ARCHITECTURE.md`'s persona decision |
| `shortDescription`                   | Used in docs and the widget's empty state — not sent to the model                       |
| `siteUrl`                            | The site being indexed — also what you point AI Search's crawler at (`docs/SETUP.md`)   |
| `supportedLocales` / `defaultLocale` | Which languages the bot will reply in — see `core/language.ts`                          |
| `systemPromptIntro`                  | The role/scope sentence at the top of every system prompt (`core/prompt.ts`)            |
| `fallbackMessage`                    | Per-locale: what the bot says when the knowledge base doesn't cover a question          |
| `contactCta`                         | Per-locale: what it offers instead — a real contact route                               |

Then:

1. Create an AI Search instance for your site and update `AI_SEARCH_INSTANCE` in `wrangler.jsonc`
   (`docs/SETUP.md` §1).
2. Write a seed knowledge document for your site (see `docs/kb/jorge-profile.md` for the shape — a
   thin site benefits enormously from one curated Markdown doc).
3. Set your own secrets (`docs/SETUP.md` §3) and, if using WhatsApp, do your own Meta app setup
   (`docs/SETUP.md` §4 — you cannot reuse someone else's Meta app for your number).
4. `pnpm deploy`.

Rename the Worker itself in `wrangler.jsonc`'s `"name"` field before deploying — it becomes part of
your `*.workers.dev` subdomain.

## Multi-tenant (running this as infrastructure for several sites)

See `docs/SAAS.md` — the persona fields above become fields in a `POST /admin/tenants` request
instead of `config/persona.ts`, one tenant per site.

## What you're NOT expected to change

The pipeline (`core/pipeline.ts`), the channel adapters, the Durable Objects, and the rate-limiting
logic are the same for every deployment — retargeting this bot is a config and content change, not a
code change. If you find yourself editing `api/src/` to point at a different site, something in
`config/persona.ts` is probably missing a field it should have — consider opening an issue instead of
carrying a fork-specific patch.
