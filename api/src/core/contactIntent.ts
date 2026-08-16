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

/**
 * Typo-tolerant backstop for the patterns above — exact regexes miss a typed
 * "metting", "shedule", or a message mangled to "meeti g" (a dropped letter
 * splits one word into two tokens, e.g. "meeti" + "g"). Only longer words
 * (>= 7 letters) are fuzzy-matched: shorter ones ("call", "meet", "cita")
 * are common enough substrings of unrelated words that even a 1-edit
 * tolerance would false-positive too easily (e.g. "wall" is one
 * substitution from "call"). A false positive here has the same low cost
 * noted above — one extra Claude call — but an unbounded one isn't worth
 * the false-positive rate, which is why every entry below is long enough
 * that a 2-edit tolerance still doesn't collide with common unrelated words.
 */
const FUZZY_KEYWORDS = [
  "meeting",
  "schedule",
  "contact",
  "contactar",
  "reunion",
  "agendar",
  "llamada",
];

const MAX_EDIT_DISTANCE = 2;

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = new Array(rows * cols);
  for (let i = 0; i < rows; i++) dp[i * cols] = i;
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * cols + j] = Math.min(
        (dp[(i - 1) * cols + j] as number) + 1,
        (dp[i * cols + j - 1] as number) + 1,
        (dp[(i - 1) * cols + (j - 1)] as number) + cost,
      );
    }
  }
  return dp[rows * cols - 1] as number;
}

function hasFuzzyContactKeyword(text: string): boolean {
  const tokens = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents (reunión -> reunion) so the ASCII keyword list still matches
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

  return tokens.some((token) =>
    FUZZY_KEYWORDS.some((keyword) => {
      if (Math.abs(token.length - keyword.length) > MAX_EDIT_DISTANCE) {
        return false; // cheap pre-filter before the O(n*m) distance calculation
      }
      return levenshtein(token, keyword) <= MAX_EDIT_DISTANCE;
    }),
  );
}

export function isContactIntent(text: string): boolean {
  return (
    CONTACT_INTENT_PATTERNS.some((pattern) => pattern.test(text)) || hasFuzzyContactKeyword(text)
  );
}
