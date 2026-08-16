/**
 * A message asking to schedule a meeting, get in touch, or contact/hire
 * directly rarely matches any indexed site content — there's no page
 * titled "how to book a meeting" — so without this check it always fell
 * into the same "no relevant content" deflection as a genuinely
 * unanswerable question (see core/pipeline.ts), even though this is
 * exactly the kind of message capture_lead (core/generate.ts) exists for.
 *
 * Deliberately a loose substring/keyword match, not exact like
 * core/greeting.ts's bare-greeting check — this needs to catch a full
 * sentence ("how do I set up a meeting?"). A false positive here just
 * costs one extra Claude call on a message that wasn't really about
 * contacting; a false negative just falls back to the pre-existing
 * deflection, no worse than before this existed.
 */
const CONTACT_INTENT_PATTERNS = [
  // en
  /\bmeet(ing)?\b/i,
  /\bcall\b/i,
  /\bschedul/i,
  /\bbook(ing)?\s+(a\s+)?(call|meeting|time|slot)\b/i,
  /\bcontact\b/i,
  /\breach\s+(you|him|out)\b/i,
  /\bget\s+in\s+touch\b/i,
  /\bhire\b/i,
  // es
  /\breuni[oó]n/i,
  /\bcita\b/i,
  /\bllamada\b/i,
  /\bcontactar/i,
  /\bagendar/i,
  // zh
  /会议/,
  /预约/,
  /联系/,
  /见面/,
];

export function isContactIntent(text: string): boolean {
  return CONTACT_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}
