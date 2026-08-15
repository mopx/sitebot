/**
 * The persona config contract. This is the ENTIRE surface a fork needs to
 * edit to repoint this bot at a different site/person — see /config/persona.ts
 * for the live values and /config/persona.example.ts for a blank template.
 *
 * Nothing in api/src should hardcode a name, site URL, or contact detail —
 * every such string flows through a BotPersona instance. If you're adding a
 * string like that, it belongs here instead.
 */

import type { SupportedLocale } from "./channel.js";

export interface BotPersona {
  /** Short bot/product name, e.g. shown in the widget header. */
  botName: string;
  /** The person or entity the bot answers questions about, third person, e.g. "Jorge". */
  subjectName: string;
  /** One-line description used in docs and the widget's empty state. */
  shortDescription: string;
  /** The site the bot is grounded in — also the AI Search crawl target. */
  siteUrl: string;
  /** Locales the bot will actively reply in. Order does not matter; `defaultLocale` must be a member. */
  supportedLocales: SupportedLocale[];
  defaultLocale: SupportedLocale;
  /** One sentence of free-standing context injected into the system prompt (role/scope), not the whole prompt. */
  systemPromptIntro: string;
  /** What the bot offers instead of answering when the knowledge base doesn't cover the question, per locale. */
  fallbackMessage: Partial<Record<SupportedLocale, string>>;
  /** Shown alongside the fallback — "reach out at ..." — per locale. */
  contactCta: Partial<Record<SupportedLocale, string>>;
}

/** Identity helper so config authors get autocomplete + type-checking with zero runtime cost. */
export function definePersona(persona: BotPersona): BotPersona {
  return persona;
}
