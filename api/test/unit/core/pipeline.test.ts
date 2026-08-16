import { describe, expect, it, vi } from "vitest";
import type { Tenant, InboundMessage, ChatTurn, TurnStatus } from "@sitebot/shared";
import {
  handleTurn,
  type ConversationRpc,
  type BudgetRpc,
  type PipelineDeps,
} from "../../../src/core/pipeline.js";
import type { Retriever, RetrievedChunk } from "../../../src/core/retrieval.js";
import {
  GenerationError,
  type Generator,
  type GenerateParams,
  type GenerateResult,
} from "../../../src/core/generate.js";
import type { LeadSink, CapturedLead, LeadContext } from "../../../src/core/leads.js";
import { contactActions } from "../../../src/core/actions.js";

const tenant: Tenant = {
  id: "tenant-1",
  slug: "test",
  status: "active",
  botName: "Test Bot",
  subjectName: "Test Subject",
  shortDescription: "desc",
  siteUrl: "https://example.com",
  supportedLocales: ["en", "es"],
  defaultLocale: "en",
  systemPromptIntro: "intro",
  fallbackMessage: { en: "No info on that.", es: "Sin informacion." },
  contactCta: { en: "Reach out.", es: "Contacta." },
  aiSearchInstance: "test-instance",
  createdAt: 0,
};

const inbound: InboundMessage = {
  channel: "web",
  eventId: "evt-1",
  senderId: "session-1",
  text: "What does Jorge do?",
  timestamp: Date.now(),
};

function historyEndingWith(text: string): ChatTurn[] {
  return [{ role: "user", content: text, createdAt: Date.now() }];
}

class StubRetriever implements Retriever {
  constructor(private readonly chunks: RetrievedChunk[]) {}
  retrieve = vi.fn(async (): Promise<RetrievedChunk[]> => this.chunks);
}

class ThrowingRetriever implements Retriever {
  retrieve = vi.fn(async (): Promise<RetrievedChunk[]> => {
    throw new Error("AI Search unavailable");
  });
}

class StubGenerator implements Generator {
  constructor(private readonly result: GenerateResult = { text: "Jorge builds web and mobile apps." }) {}
  generate = vi.fn(async (_params: GenerateParams): Promise<GenerateResult> => this.result);
}

class ThrowingGenerator implements Generator {
  generate = vi.fn(async (): Promise<GenerateResult> => {
    throw new GenerationError("boom", new Error("boom"));
  });
}

class StubLeadSink implements LeadSink {
  capture = vi.fn(async (_lead: CapturedLead, _ctx: LeadContext): Promise<void> => undefined);
}

class ThrowingLeadSink implements LeadSink {
  capture = vi.fn(async (): Promise<void> => {
    throw new Error("D1 unavailable");
  });
}

function fakeConversation(
  beginTurn: () => Promise<TurnStatus> = async () => ({
    status: "ok",
    history: historyEndingWith(inbound.text),
    lang: "en",
  }),
): ConversationRpc & {
  beginTurn: ReturnType<typeof vi.fn>;
  completeTurn: ReturnType<typeof vi.fn>;
  failTurn: ReturnType<typeof vi.fn>;
} {
  return {
    beginTurn: vi.fn(beginTurn),
    completeTurn: vi.fn(async (): Promise<void> => undefined),
    failTurn: vi.fn(async (): Promise<void> => undefined),
  };
}

function fakeBudget(
  tryConsume: () => Promise<{ allowed: boolean }> = async () => ({ allowed: true }),
): BudgetRpc & { tryConsume: ReturnType<typeof vi.fn>; refund: ReturnType<typeof vi.fn> } {
  return {
    tryConsume: vi.fn(tryConsume),
    refund: vi.fn(async (): Promise<void> => undefined),
  };
}

interface TestSetup {
  deps: PipelineDeps;
  conversation: ReturnType<typeof fakeConversation>;
  budget: ReturnType<typeof fakeBudget>;
  retriever: StubRetriever | ThrowingRetriever;
  generator: StubGenerator | ThrowingGenerator;
  leadSink: StubLeadSink | ThrowingLeadSink;
}

function buildDeps(
  overrides: {
    conversation?: ReturnType<typeof fakeConversation>;
    budget?: ReturnType<typeof fakeBudget>;
    retriever?: StubRetriever | ThrowingRetriever;
    generator?: StubGenerator | ThrowingGenerator;
    leadSink?: StubLeadSink | ThrowingLeadSink;
  } = {},
): TestSetup {
  const conversation = overrides.conversation ?? fakeConversation();
  const budget = overrides.budget ?? fakeBudget();
  const retriever =
    overrides.retriever ??
    new StubRetriever([
      { text: "Jorge builds apps.", source: { url: "https://example.com" }, score: 0.9 },
    ]);
  const generator = overrides.generator ?? new StubGenerator();
  const leadSink = overrides.leadSink ?? new StubLeadSink();

  const deps: PipelineDeps = {
    tenant,
    conversation,
    budget,
    retriever,
    generator,
    leadSink,
    conversationKey: "tenant-1:web:session-1",
    maxPerDay: 40,
    historyWindow: 12,
    maxReplyTokens: 800,
    budgetDailyCallCap: 1500,
  };
  return { deps, conversation, budget, retriever, generator, leadSink };
}

describe("handleTurn", () => {
  it("returns duplicate without touching retrieval, generation, or budget", async () => {
    const { deps, budget, retriever } = buildDeps({
      conversation: fakeConversation(async () => ({ status: "duplicate" })),
    });
    const result = await handleTurn(deps, inbound);
    expect(result).toEqual({ kind: "duplicate" });
    expect(budget.tryConsume).not.toHaveBeenCalled();
    expect(retriever.retrieve).not.toHaveBeenCalled();
  });

  it("returns rate_limited without touching retrieval or generation", async () => {
    const { deps, retriever } = buildDeps({
      conversation: fakeConversation(async () => ({ status: "rate_limited", retryAfterSec: 3600 })),
    });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("rate_limited");
    if (result.kind === "rate_limited") expect(result.retryAfterSec).toBe(3600);
    expect(retriever.retrieve).not.toHaveBeenCalled();
  });

  it("replies with a friendly greeting, skipping retrieval, generation, and budget, for a bare 'hey'", async () => {
    const { deps, conversation, budget, retriever, generator } = buildDeps({
      conversation: fakeConversation(async () => ({
        status: "ok",
        history: historyEndingWith("Hey"),
        lang: "en",
      })),
    });
    const result = await handleTurn(deps, { ...inbound, text: "Hey" });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toContain(tenant.subjectName);
      expect(result.text).not.toContain("No info on that.");
      expect(result.sources).toHaveLength(0);
    }
    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
    expect(budget.tryConsume).not.toHaveBeenCalled();
    expect(conversation.completeTurn).toHaveBeenCalledWith(
      expect.stringContaining(tenant.subjectName),
      "en",
    );
  });

  it("offers contact quick replies alongside the greeting reply", async () => {
    const { deps } = buildDeps({
      conversation: fakeConversation(async () => ({
        status: "ok",
        history: historyEndingWith("Hey"),
        lang: "en",
      })),
    });
    const result = await handleTurn(deps, { ...inbound, text: "Hey" });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.actions).toEqual(contactActions(tenant, "en"));
  });

  it("deflects without calling the generator or spending budget when retrieval finds nothing", async () => {
    const { deps, conversation, budget, generator } = buildDeps({
      retriever: new StubRetriever([]),
    });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toContain("No info on that.");
      expect(result.sources).toHaveLength(0);
      expect(result.actions).toEqual(contactActions(tenant, "en"));
    }
    expect(generator.generate).not.toHaveBeenCalled();
    expect(budget.tryConsume).not.toHaveBeenCalled();
    expect(conversation.completeTurn).toHaveBeenCalledWith(
      expect.stringContaining("No info on that."),
      "en",
    );
  });

  it("offers quick replies in the conversation's resolved language, not a client hint", async () => {
    const { deps } = buildDeps({
      retriever: new StubRetriever([]),
      conversation: fakeConversation(async () => ({
        status: "ok",
        history: historyEndingWith(inbound.text),
        lang: "es",
      })),
    });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.actions).toEqual(contactActions(tenant, "es"));
  });

  it("calls the generator instead of deflecting when retrieval finds nothing but the message is a contact/meeting request", async () => {
    const { deps, generator, budget } = buildDeps({ retriever: new StubRetriever([]) });
    const result = await handleTurn(deps, { ...inbound, text: "How do I set up a meeting?" });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toBe("Jorge builds web and mobile apps.");
      expect(result.actions).toBeUndefined();
    }
    expect(budget.tryConsume).toHaveBeenCalledOnce();
    expect(generator.generate).toHaveBeenCalledOnce();
  });

  it("on the happy path: retrieves, consumes budget, generates, and completes the turn", async () => {
    const { deps, conversation, budget } = buildDeps();
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toBe("Jorge builds web and mobile apps.");
      expect(result.sources).toEqual([{ url: "https://example.com" }]);
      expect(result.actions).toBeUndefined();
    }
    expect(budget.tryConsume).toHaveBeenCalledWith(1500);
    expect(conversation.completeTurn).toHaveBeenCalledWith(
      "Jorge builds web and mobile apps.",
      "en",
    );
  });

  it("passes the persisted-turn history (ending with the current message) to the generator", async () => {
    const { deps, generator } = buildDeps();
    await handleTurn(deps, inbound);
    const call = generator.generate.mock.calls[0]?.[0] as GenerateParams;
    expect(call.history.at(-1)).toMatchObject({ role: "user", content: inbound.text });
  });

  it("returns at_capacity and does not call the generator when the daily call cap is reached", async () => {
    const { deps, conversation, generator } = buildDeps({
      budget: fakeBudget(async () => ({ allowed: false })),
    });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("at_capacity");
    expect(conversation.failTurn).toHaveBeenCalledOnce();
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("falls back gracefully and refunds the quota slot when retrieval throws", async () => {
    const { deps, conversation } = buildDeps({ retriever: new ThrowingRetriever() });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toContain("notes just now");
      expect(result.actions).toBeUndefined();
    }
    expect(conversation.failTurn).toHaveBeenCalledOnce();
    expect(conversation.completeTurn).not.toHaveBeenCalled();
  });

  it("falls back gracefully, refunds the budget slot, and fails the turn when generation throws", async () => {
    const { deps, conversation, budget } = buildDeps({ generator: new ThrowingGenerator() });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toContain("went wrong on my end");
      expect(result.actions).toBeUndefined();
    }
    expect(budget.refund).toHaveBeenCalledOnce();
    expect(conversation.failTurn).toHaveBeenCalledOnce();
    expect(conversation.completeTurn).not.toHaveBeenCalled();
  });

  it("captures the lead when the generator returns one", async () => {
    const lead: CapturedLead = {
      name: "Maria",
      email: "maria@example.com",
      projectDescription: "Needs a marketing site.",
    };
    const { deps, leadSink } = buildDeps({
      generator: new StubGenerator({ text: "Got it, I'll pass this along.", leadCapture: lead }),
    });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toBe("Got it, I'll pass this along.");
      expect(result.leadCaptured).toBe(true);
    }
    expect(leadSink.capture).toHaveBeenCalledWith(lead, {
      tenantId: tenant.id,
      channel: inbound.channel,
      conversationKey: deps.conversationKey,
    });
  });

  it("does not touch the lead sink when the generator returns no lead capture", async () => {
    const { deps, leadSink } = buildDeps();
    const result = await handleTurn(deps, inbound);
    expect(leadSink.capture).not.toHaveBeenCalled();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.leadCaptured).toBeFalsy();
  });

  it("still returns the reply to the user and flags leadCaptured when the lead sink throws", async () => {
    const lead: CapturedLead = {
      name: "Maria",
      phone: "+1 555 0100",
      projectDescription: "Needs a marketing site.",
    };
    const { deps, conversation } = buildDeps({
      generator: new StubGenerator({ text: "Got it, I'll pass this along.", leadCapture: lead }),
      leadSink: new ThrowingLeadSink(),
    });
    const result = await handleTurn(deps, inbound);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.text).toBe("Got it, I'll pass this along.");
      // Model intent, not sink success — a D1/Asana blip must never retract
      // this after the reply already told the visitor it was passed along.
      expect(result.leadCaptured).toBe(true);
    }
    expect(conversation.completeTurn).toHaveBeenCalledWith("Got it, I'll pass this along.", "en");
  });
});
