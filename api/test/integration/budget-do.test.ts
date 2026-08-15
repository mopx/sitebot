import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import type { BudgetRpc } from "../../src/core/pipeline.js";

function freshStub(testName: string): BudgetRpc {
  const id = env.BUDGET.idFromName(`budget-do-test:${testName}:${crypto.randomUUID()}`);
  return env.BUDGET.get(id) as unknown as BudgetRpc;
}

describe("BudgetDO", () => {
  it("allows calls up to the cap and denies the next one", async () => {
    const stub = freshStub("cap");
    expect((await stub.tryConsume(2)).allowed).toBe(true);
    expect((await stub.tryConsume(2)).allowed).toBe(true);
    expect((await stub.tryConsume(2)).allowed).toBe(false);
  });

  it("does not increment the counter on a denied attempt (no drift past the cap)", async () => {
    const stub = freshStub("no-drift");
    await stub.tryConsume(1);
    await stub.tryConsume(1); // denied
    await stub.tryConsume(1); // denied
    // Refunding once should free exactly one slot, proving the count sat at 1, not 3.
    await stub.refund();
    expect((await stub.tryConsume(1)).allowed).toBe(true);
  });

  it("refund frees a slot for reuse the same day", async () => {
    const stub = freshStub("refund");
    await stub.tryConsume(1);
    expect((await stub.tryConsume(1)).allowed).toBe(false);
    await stub.refund();
    expect((await stub.tryConsume(1)).allowed).toBe(true);
  });

  it("refund on an empty counter does not go negative (next call still consumes normally)", async () => {
    const stub = freshStub("refund-floor");
    await stub.refund();
    await stub.refund();
    expect((await stub.tryConsume(1)).allowed).toBe(true);
    expect((await stub.tryConsume(1)).allowed).toBe(false);
  });
});
