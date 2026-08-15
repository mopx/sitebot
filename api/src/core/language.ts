import type { SupportedLocale } from "@sitebot/shared";

export interface ResolveLocaleOptions {
  /** Only the web widget can supply this reliably — see shared/src/channel.ts. */
  hint?: SupportedLocale;
  /** The language used last turn in this conversation, if any. */
  persisted?: SupportedLocale;
  supportedLocales: SupportedLocale[];
  defaultLocale: SupportedLocale;
}

/**
 * Priority order (docs/ARCHITECTURE.md §Language policy):
 *   1. Explicit hint (web widget's ?lang= param) — trusted outright.
 *   2. Persisted preference from the previous turn — keeps a one-word reply
 *      ("ok", an emoji) from flipping the bot's language mid-conversation.
 *   3. Tenant default.
 *
 * Layer 2 of the full policy — "detect the language of *this* message and
 * switch if it's clearly different" — is deliberately NOT done here. It's a
 * system-prompt instruction (see prompt.ts), because it needs to read the
 * actual message text and every supported language is one Claude already
 * handles natively; a JS detection step would be an extra dependency doing
 * a worse job than the call we're already making.
 */
export function resolveLocale(opts: ResolveLocaleOptions): SupportedLocale {
  if (opts.hint && opts.supportedLocales.includes(opts.hint)) return opts.hint;
  if (opts.persisted && opts.supportedLocales.includes(opts.persisted)) return opts.persisted;
  return opts.defaultLocale;
}
