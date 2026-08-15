import { describe, expect, it } from "vitest";
import { getOrCreateSessionId } from "../src/session.js";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("getOrCreateSessionId", () => {
  it("creates a session id on first call", () => {
    const storage = new MemoryStorage();
    const id = getOrCreateSessionId(storage);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the same id on subsequent calls (persisted)", () => {
    const storage = new MemoryStorage();
    const first = getOrCreateSessionId(storage);
    const second = getOrCreateSessionId(storage);
    expect(second).toBe(first);
  });

  it("creates different ids across independent storages", () => {
    const a = getOrCreateSessionId(new MemoryStorage());
    const b = getOrCreateSessionId(new MemoryStorage());
    expect(a).not.toBe(b);
  });
});
