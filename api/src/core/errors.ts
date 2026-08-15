import type { BotPersona } from "@sitebot/shared";
import type { SupportedLocale } from "@sitebot/shared";

/**
 * User-facing fallback copy, per failure reason, per locale. Every string a
 * user can see when something goes wrong lives here — never inline in a
 * route or channel adapter — so a translator can find and fix all of it in
 * one file, and so no fallback path accidentally leaks an error message,
 * stack trace, or provider error string to an end user.
 */
export type FailureReason =
  | "rate_limited"
  | "at_capacity"
  | "generation_failed"
  | "retrieval_failed"
  | "unsupported_message_type"
  | "stale_message";

const COPY: Record<FailureReason, Partial<Record<SupportedLocale, string>>> = {
  rate_limited: {
    en: "You've reached today's message limit — try again tomorrow.",
    es: "Has alcanzado el límite de mensajes de hoy — inténtalo de nuevo mañana.",
    zh: "你今天的消息次数已达上限，请明天再试。",
  },
  at_capacity: {
    en: "I'm getting a lot of questions right now — please try again in a bit.",
    es: "Estoy recibiendo muchas preguntas en este momento — inténtalo de nuevo en un rato.",
    zh: "现在提问的人有点多，请稍后再试。",
  },
  generation_failed: {
    en: "Something went wrong on my end — please try again in a moment.",
    es: "Algo salió mal de mi parte — inténtalo de nuevo en un momento.",
    zh: "出了点问题，请稍后再试一次。",
  },
  retrieval_failed: {
    en: "I can search the site but couldn't reach my notes just now — try again shortly.",
    es: "Puedo buscar en el sitio pero no pude acceder a mis notas — inténtalo de nuevo en breve.",
    zh: "我可以搜索网站，但刚才无法访问我的资料，请稍后再试。",
  },
  unsupported_message_type: {
    en: "I can only read text messages right now.",
    es: "Por ahora solo puedo leer mensajes de texto.",
    zh: "目前我只能读取文字消息。",
  },
  stale_message: {
    en: "",
    es: "",
    zh: "",
  },
};

export function fallbackCopy(
  reason: FailureReason,
  locale: SupportedLocale,
  defaultLocale: SupportedLocale,
): string {
  return COPY[reason][locale] ?? COPY[reason][defaultLocale] ?? COPY[reason].en ?? "";
}

/** The "I don't have anything on that" deflection uses the tenant's own configured copy, not this table. */
export function deflectionCopy(persona: BotPersona, locale: SupportedLocale): string {
  const fallback =
    persona.fallbackMessage[locale] ?? persona.fallbackMessage[persona.defaultLocale];
  const cta = persona.contactCta[locale] ?? persona.contactCta[persona.defaultLocale];
  return [fallback, cta].filter(Boolean).join(" ");
}
