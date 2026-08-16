import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { extractGenerateResult, ClaudeGenerator } from "../../../src/core/generate.js";

function message(content: Anthropic.Message["content"]): Anthropic.Message {
  return { content } as Anthropic.Message;
}

describe("extractGenerateResult", () => {
  it("returns the text block's content with no leadCapture when no tool was called", () => {
    const result = extractGenerateResult(
      message([{ type: "text", text: "Jorge builds web apps." } as never]),
    );
    expect(result).toEqual({ text: "Jorge builds web apps.", leadCapture: undefined });
  });

  it("concatenates multiple text blocks", () => {
    const result = extractGenerateResult(
      message([
        { type: "text", text: "Part one. " } as never,
        { type: "text", text: "Part two." } as never,
      ]),
    );
    expect(result.text).toBe("Part one. Part two.");
  });

  it("extracts a validated leadCapture alongside the text reply", () => {
    const result = extractGenerateResult(
      message([
        { type: "text", text: "Got it, I'll pass this along." } as never,
        {
          type: "tool_use",
          name: "capture_lead",
          input: { name: "Maria", email: "maria@example.com", projectDescription: "A marketing site." },
        } as never,
      ]),
    );
    expect(result.text).toBe("Got it, I'll pass this along.");
    expect(result.leadCapture).toEqual({
      name: "Maria",
      email: "maria@example.com",
      projectDescription: "A marketing site.",
    });
  });

  it("drops a tool call with invalid input rather than throwing", () => {
    const result = extractGenerateResult(
      message([
        { type: "text", text: "Got it." } as never,
        { type: "tool_use", name: "capture_lead", input: { name: "Maria" } } as never,
      ]),
    );
    expect(result.leadCapture).toBeUndefined();
  });

  it("ignores tool_use blocks for tools other than capture_lead", () => {
    const result = extractGenerateResult(
      message([
        { type: "text", text: "Got it." } as never,
        { type: "tool_use", name: "some_other_tool", input: { anything: true } } as never,
      ]),
    );
    expect(result.leadCapture).toBeUndefined();
  });
});

/** JSON body of an Anthropic Messages API response — only the fields ClaudeGenerator/extractGenerateResult read. */
function apiResponse(content: unknown[]): object {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content,
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ClaudeGenerator (tool-use retry path — real API calls are otherwise out of scope, see CLAUDE.md)", () => {
  it("retries with a tool_result when the first response is a bare tool call with no text", async () => {
    const leadInput = { name: "Maria", email: "maria@example.com", projectDescription: "A site." };
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init?.body ? JSON.parse(init.body as string) : undefined);
      if (calls.length === 1) {
        return jsonResponse(
          apiResponse([
            { type: "tool_use", id: "toolu_1", name: "capture_lead", input: leadInput },
          ]),
        );
      }
      return jsonResponse(apiResponse([{ type: "text", text: "Got it, I'll pass this along." }]));
    });

    const generator = new ClaudeGenerator("test-key", fetchImpl as unknown as typeof fetch);
    const result = await generator.generate({
      systemPrompt: "system",
      history: [{ role: "user", content: "hi", createdAt: 0 }],
      model: "claude-haiku-4-5",
      maxTokens: 100,
    });

    expect(result.text).toBe("Got it, I'll pass this along.");
    expect(result.leadCapture).toEqual(leadInput);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const followupBody = calls[1] as { messages: { role: string; content: unknown }[] };
    const toolResultMessage = followupBody.messages.at(-1) as {
      role: string;
      content: { type: string; tool_use_id: string }[];
    };
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
  });

  it("throws when neither the first response nor the retry produces any text", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(apiResponse([{ type: "tool_use", id: "toolu_1", name: "capture_lead", input: {} }])),
    );
    const generator = new ClaudeGenerator("test-key", fetchImpl as unknown as typeof fetch);

    await expect(
      generator.generate({
        systemPrompt: "system",
        history: [{ role: "user", content: "hi", createdAt: 0 }],
        model: "claude-haiku-4-5",
        maxTokens: 100,
      }),
    ).rejects.toThrow("Claude response contained no text block");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
