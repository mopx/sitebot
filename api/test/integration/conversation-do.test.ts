import { describe, expect, it } from "vitest";
import { env, runDurableObjectAlarm } from "cloudflare:test";
import type { ConversationRpc } from "../../src/core/pipeline.js";

function freshStub(testName: string): ConversationRpc {
  const id = env.CONVERSATION.idFromName(`conversation-do-test:${testName}:${crypto.randomUUID()}`);
  return env.CONVERSATION.get(id) as unknown as ConversationRpc;
}

const opts = { maxPerDay: 3, historyWindow: 12 } as const;

describe("ConversationDO", () => {
  it("returns the conversation ending with the just-appended user message", async () => {
    const stub = freshStub("history");
    const turn = await stub.beginTurn("evt-1", "Hello", opts);
    expect(turn.status).toBe("ok");
    if (turn.status === "ok") {
      expect(turn.history.at(-1)).toMatchObject({ role: "user", content: "Hello" });
      expect(turn.lang).toBe("en"); // default when nothing persisted and no hint given
    }
  });

  it("detects a replayed event id as a duplicate and does not re-append it", async () => {
    const stub = freshStub("dedup");
    await stub.beginTurn("evt-dup", "First", opts);
    const replay = await stub.beginTurn("evt-dup", "First", opts);
    expect(replay.status).toBe("duplicate");

    const history = await stub.getHistory(12);
    expect(history.filter((t) => t.content === "First")).toHaveLength(1);
  });

  it("enforces the per-day quota and returns rate_limited once exceeded", async () => {
    const stub = freshStub("quota");
    await stub.beginTurn("evt-1", "one", opts);
    await stub.beginTurn("evt-2", "two", opts);
    await stub.beginTurn("evt-3", "three", opts);
    const fourth = await stub.beginTurn("evt-4", "four", opts);
    expect(fourth.status).toBe("rate_limited");
    if (fourth.status === "rate_limited") {
      expect(fourth.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("failTurn refunds the quota slot so a subsequent message isn't blocked", async () => {
    const stub = freshStub("refund");
    await stub.beginTurn("evt-1", "one", { ...opts, maxPerDay: 1 });
    await stub.failTurn(); // simulate: retrieval/generation failed, refund the slot
    const retry = await stub.beginTurn("evt-2", "one again", { ...opts, maxPerDay: 1 });
    expect(retry.status).toBe("ok");
  });

  it("completeTurn appends the assistant reply and persists the language used", async () => {
    const stub = freshStub("complete");
    await stub.beginTurn("evt-1", "Hola", { ...opts, langHint: "es" });
    await stub.completeTurn("Jorge hace...", "es");

    const history = await stub.getHistory(12);
    expect(history.at(-1)).toMatchObject({ role: "assistant", content: "Jorge hace..." });

    // A later turn with no hint should pick up the persisted "es" preference.
    const next = await stub.beginTurn("evt-2", "ok", opts);
    if (next.status === "ok") expect(next.lang).toBe("es");
  });

  it("an explicit langHint overrides the persisted preference", async () => {
    const stub = freshStub("hint-override");
    await stub.beginTurn("evt-1", "Hola", { ...opts, langHint: "es" });
    await stub.completeTurn("...", "es");
    const next = await stub.beginTurn("evt-2", "hi", { ...opts, langHint: "en" });
    if (next.status === "ok") expect(next.lang).toBe("en");
  });

  it("alarm() runs without throwing (housekeeping is a no-op on a fresh, active conversation)", async () => {
    const stub = freshStub("alarm");
    await stub.beginTurn("evt-1", "hi", opts);
    await expect(runDurableObjectAlarm(stub as never)).resolves.not.toThrow();
    // Still there afterwards — nothing is old enough to prune yet.
    const history = await stub.getHistory(12);
    expect(history).toHaveLength(1);
  });
});
