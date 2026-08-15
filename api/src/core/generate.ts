import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurn } from "@sitebot/shared";

export interface GenerateParams {
  systemPrompt: string;
  history: ChatTurn[]; // ends with the current user turn — see durable/conversation.ts#beginTurn
  model: string;
  maxTokens: number;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * Dependency-injected for the same reason as Retriever (core/retrieval.ts):
 * tests must never make a real, billed call to the Anthropic API. Tests
 * supply a `StubGenerator`.
 */
export interface Generator {
  generate(params: GenerateParams): Promise<string>;
}

const REQUEST_TIMEOUT_MS = 20_000;

export class ClaudeGenerator implements Generator {
  constructor(private readonly apiKey: string) {}

  async generate(params: GenerateParams): Promise<string> {
    // Constructed per call, not module-scope — Workers must not hold
    // per-request state in globals, and the SDK is cheap to construct.
    const client = new Anthropic({ apiKey: this.apiKey, timeout: REQUEST_TIMEOUT_MS });

    try {
      const response = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        messages: params.history.map((turn) => ({ role: turn.role, content: turn.content })),
        // Deliberately no `thinking`, no `output_config.effort`: this is a single
        // grounded Q&A turn on claude-haiku-4-5, which doesn't support `effort`
        // at all (it errors) and gains nothing from extended thinking here —
        // see docs/ARCHITECTURE.md §RAG pipeline for the full rationale, and
        // do not add `cache_control` either (Haiku 4.5's minimum cacheable
        // prefix is 4096 tokens; this system prompt is far shorter, so a
        // breakpoint would silently never cache).
      });

      const text = response.content.find((block) => block.type === "text");
      if (!text || text.type !== "text") {
        throw new GenerationError("Claude response contained no text block", response);
      }
      return text.text;
    } catch (err) {
      if (err instanceof GenerationError) throw err;
      throw new GenerationError("Claude API call failed", err);
    }
  }
}
