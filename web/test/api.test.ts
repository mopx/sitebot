import { afterEach, describe, expect, it, vi } from "vitest";
import { sendChatMessage } from "../src/api.js";
import { CHAT_SESSION_HEADER } from "@sitebot/shared";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendChatMessage", () => {
  it("posts to /api/chat with the session header and JSON body", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ reply: "hi", sources: [], conversationId: "c1" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendChatMessage(
      { apiUrl: "https://bot.example.com", sessionId: "session-1" },
      { message: "hello" },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://bot.example.com/api/chat");
    expect((init!.headers as Record<string, string>)[CHAT_SESSION_HEADER]).toBe("session-1");
    expect(JSON.parse(init!.body as string)).toEqual({ message: "hello" });
  });

  it("includes the tenant slug in the path when provided", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ reply: "hi", sources: [], conversationId: "c1" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendChatMessage(
      { apiUrl: "https://bot.example.com/", tenant: "acme", sessionId: "session-1" },
      { message: "hello" },
    );

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://bot.example.com/api/chat/acme");
  });

  it("returns a server_error response if the fetch itself fails to parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    const result = await sendChatMessage(
      { apiUrl: "https://bot.example.com", sessionId: "s1" },
      { message: "hi" },
    );
    expect(result).toEqual({ error: "server_error" });
  });
});
