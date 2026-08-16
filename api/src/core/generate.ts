import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurn } from "@sitebot/shared";
import { parseCapturedLead, type CapturedLead } from "./leads.js";

export interface GenerateParams {
  systemPrompt: string;
  history: ChatTurn[]; // ends with the current user turn — see durable/conversation.ts#beginTurn
  model: string;
  maxTokens: number;
}

export interface GenerateResult {
  text: string;
  /** Set when the model called capture_lead with input that passed validation (name, project description, and at least one contact method) — see core/leads.ts#parseCapturedLead. */
  leadCapture?: CapturedLead;
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
  generate(params: GenerateParams): Promise<GenerateResult>;
}

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Always offered, not persona-specific — the persona-specific judgment call
 * ("does this count as a lead yet") lives in the system prompt (core/prompt.ts
 * section 4), which already has the persona in scope. This tool's own
 * description only needs to describe its shape and its calling contract.
 */
const LEAD_CAPTURE_TOOL: Anthropic.Tool = {
  name: "capture_lead",
  description:
    "Record a potential client's contact details and project needs. Call this at most once per " +
    "reply, and only once the person has expressed interest in hiring/working together and you have " +
    "their name, a short description of what they need, and at least one way to reach them (email or " +
    "phone). Do not call this for casual questions or browsing — only for genuine leads. Always still " +
    "reply to the person with a short text message in the same turn, confirming you've passed their " +
    "details along.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The person's name." },
      email: { type: "string", description: "Email address, if given." },
      phone: { type: "string", description: "Phone number, if given." },
      budget: { type: "string", description: "Budget or price range, if mentioned." },
      projectDescription: { type: "string", description: "What they want built or need help with." },
    },
    required: ["name", "projectDescription"],
  },
};

/** Pure so it can be unit-tested without a real Anthropic client — see test/unit/core/generate.test.ts. */
export function extractGenerateResult(message: Anthropic.Message): GenerateResult {
  let text = "";
  let leadCapture: CapturedLead | undefined;
  for (const block of message.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use" && block.name === "capture_lead") {
      leadCapture = parseCapturedLead(block.input) ?? leadCapture;
    }
  }
  return { text, leadCapture };
}

export class ClaudeGenerator implements Generator {
  /** `fetchImpl` is only ever overridden in tests — see test/unit/core/generate.test.ts — so the tool-use retry path (below) can be exercised without a real API key. */
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async generate(params: GenerateParams): Promise<GenerateResult> {
    // Constructed per call, not module-scope — Workers must not hold
    // per-request state in globals, and the SDK is cheap to construct.
    const client = new Anthropic({
      apiKey: this.apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      fetch: this.fetchImpl,
    });

    try {
      const history = params.history.map((turn) => ({ role: turn.role, content: turn.content }));
      const response = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        messages: history,
        tools: [LEAD_CAPTURE_TOOL],
        // Deliberately no `thinking`, no `output_config.effort`: this is a single
        // grounded Q&A turn on claude-haiku-4-5, which doesn't support `effort`
        // at all (it errors) and gains nothing from extended thinking here —
        // see docs/ARCHITECTURE.md §RAG pipeline for the full rationale, and
        // do not add `cache_control` either (Haiku 4.5's minimum cacheable
        // prefix is 4096 tokens; this system prompt is far shorter, so a
        // breakpoint would silently never cache).
      });

      const result = extractGenerateResult(response);
      if (result.text) return result;

      // The model called capture_lead (or some tool) but, despite the
      // LEAD_CAPTURE_TOOL description asking it to, gave no accompanying
      // reply — observed occasionally against the live API. Rather than
      // dropping the whole turn (and the lead with it — see
      // core/pipeline.ts), send the tool result back and ask for the short
      // reply it should have included the first time. No `tools` on this
      // follow-up: it must produce text, not call anything else.
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (!toolUseBlock) {
        throw new GenerationError("Claude response contained no text block", response);
      }
      const followup = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        messages: [
          ...history,
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: "Logged." }],
          },
        ],
      });
      const followupText = followup.content.find((block) => block.type === "text");
      if (!followupText || followupText.type !== "text") {
        throw new GenerationError("Claude response contained no text block", followup);
      }
      return { text: followupText.text, leadCapture: result.leadCapture };
    } catch (err) {
      if (err instanceof GenerationError) throw err;
      throw new GenerationError("Claude API call failed", err);
    }
  }
}
