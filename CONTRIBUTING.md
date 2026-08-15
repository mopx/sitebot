# Contributing

## Local setup

```bash
pnpm install
cp api/.dev.vars.example api/.dev.vars   # fill in a real ANTHROPIC_API_KEY for local testing
pnpm --filter @sitebot/api dev            # http://localhost:8787
```

Tests never need real credentials or a Cloudflare account — see the note in `CLAUDE.md` about
`wrangler.test.jsonc`. Just:

```bash
pnpm validate   # type-check + lint + full test suite
```

## Before opening a PR

- `pnpm validate` passes, with no new warnings you introduced.
- New behavior has tests. Bug fixes have a regression test.
- If you changed a request/response shape, a D1 schema, or the `Env` type, the corresponding tests
  and `.dev.vars.example`/`wrangler.jsonc` comments are updated in the same PR.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), subject line
  ≤ 72 chars. A body paragraph only when the diff doesn't explain itself.

## Code style

- TypeScript strict mode. No `any` without a comment explaining why it's unavoidable.
- Dependency-inject anything that costs money, needs live credentials, or can't run in tests (see
  `Retriever`, `Generator` in `api/src/core/`) — don't reach for a Cloudflare binding directly from
  business logic.
- Persona/site-specific strings never go in `api/src/` — see `shared/src/persona.ts` and
  `config/persona.ts`.
- User-facing failure copy lives in `api/src/core/errors.ts`, per locale. Don't inline a string a
  user might see.

## Reporting issues

Open a GitHub issue with: what you expected, what happened, and — if it's a bot-response issue —
the exact question asked and which channel (WhatsApp/Telegram/web). Never include real WhatsApp
phone numbers, access tokens, or API keys in an issue.
