import type { BotPersona, ChatAction, SupportedLocale } from "@sitebot/shared";

/**
 * Quick replies offered when the bot has nothing to answer with (the
 * zero-chunks deflection, core/pipeline.ts) or nothing to answer yet (a bare
 * greeting) — the two moments closest to a dead end for the visitor, and
 * exactly where competitor widgets (Chatbase, Salesloft) put a chip row.
 *
 * Every `send` string here MUST satisfy core/contactIntent.ts#isContactIntent
 * — otherwise clicking the chip lands right back in the same deflection
 * instead of reaching Claude. That invariant is asserted for all locales in
 * test/unit/core/actions.test.ts.
 *
 * `persona` is threaded through even though the copy below doesn't
 * interpolate it yet, so a future "Message {subjectName}" label doesn't need
 * a signature change — same shape as core/greeting.ts#greetingCopy.
 */
const CONTACT_ACTIONS: Record<SupportedLocale, ChatAction[]> = {
  en: [
    { label: "Book a meeting", send: "I'd like to set up a meeting" },
    { label: "Get in touch", send: "How can I get in touch?" },
  ],
  es: [
    { label: "Agendar una reunión", send: "Quiero agendar una reunión" },
    { label: "Contactar", send: "¿Cómo puedo contactar?" },
  ],
  zh: [
    { label: "预约会议", send: "我想预约一次会议" },
    { label: "联系方式", send: "我该如何联系？" },
  ],
};

export function contactActions(_persona: BotPersona, locale: SupportedLocale): ChatAction[] {
  return CONTACT_ACTIONS[locale];
}
