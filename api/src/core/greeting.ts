import type { BotPersona, SupportedLocale } from "@sitebot/shared";

/**
 * A bare greeting ("hi", "hola") has nothing for AI Search to retrieve, so
 * without this check it fell into the same "no relevant content" path as a
 * genuinely unanswerable question — the flat "I don't have anything on the
 * site about that yet" deflection copy, which reads as broken for a plain
 * hello. Detected up front so it can get its own friendly reply instead,
 * still without spending a Claude call (see core/pipeline.ts) — a greeting
 * carries no question to answer, so grounding it in retrieved content isn't
 * the point.
 *
 * Deliberately an exact-match set, not a "starts with" check: "hi, does
 * Jorge do mobile apps?" is a real question and must NOT be short-circuited
 * here.
 */
const GREETINGS = new Set([
  // en
  "hi",
  "hey",
  "hello",
  "hiya",
  "yo",
  "sup",
  "greetings",
  "good morning",
  "good afternoon",
  "good evening",
  // es
  "hola",
  "buenas",
  "buenos días",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  // zh
  "你好",
  "您好",
  "嗨",
  "哈喽",
]);

export function isGreeting(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/^[!¡?¿。，,.！？~～\s]+|[!¡?¿。，,.！？~～\s]+$/gu, "");
  return GREETINGS.has(normalized);
}

const GREETING_REPLY: Record<SupportedLocale, (subjectName: string) => string> = {
  en: (subject) => `Hi! Ask me anything about ${subject}'s work, skills, or availability.`,
  es: (subject) =>
    `¡Hola! Pregúntame lo que quieras sobre el trabajo, las habilidades o la disponibilidad de ${subject}.`,
  zh: (subject) => `你好！欢迎问我关于${subject}的工作、技能或时间安排的任何问题。`,
};

export function greetingCopy(persona: BotPersona, locale: SupportedLocale): string {
  return GREETING_REPLY[locale](persona.subjectName);
}
