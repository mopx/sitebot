import type { SupportedLocale } from "@sitebot/shared";

/**
 * `@sitebot/shared` only exports the `SupportedLocale` type, not a runtime
 * list — this is the one place in web/ that needs the actual values (to
 * validate `document.documentElement.lang` / `data-lang`), so it's the
 * single source of truth other modules here derive from instead of each
 * hardcoding the three codes separately.
 */
export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "es", "zh"];

export type { SupportedLocale };
