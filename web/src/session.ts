/**
 * Anonymous session identity for the web widget. A plain localStorage UUID —
 * good enough to give one visitor a continuous conversation across page
 * loads without any login. Clearing localStorage starts a fresh
 * conversation (a fresh ConversationDO server-side) but does not reset the
 * server's IP-based rate limit, by design — see docs/ARCHITECTURE.md.
 *
 * Storage is injected (not `window.localStorage` directly) so this is
 * testable under jsdom without a real browser, and so a future embed target
 * without localStorage (e.g. an iframe with storage partitioning) has
 * somewhere to swap in an alternative.
 */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "sitebot_chat_session";

export function getOrCreateSessionId(storage: SessionStorageLike): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  storage.setItem(STORAGE_KEY, created);
  return created;
}
