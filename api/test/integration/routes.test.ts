import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { CHAT_SESSION_HEADER } from "@sitebot/shared";

// These tests exercise the full HTTP stack (Hono routing, tenant resolution,
// rate limiting, the pipeline's error-handling paths) without ever calling a
// real external API — see wrangler.test.jsonc for why that's guaranteed
// (no AI_SEARCH binding in the test config, so retrieval always takes the
// caught-failure path deterministically). The "reply grounded in real site
// content" path is explicitly out of scope for automated tests — see
// docs/EVAL.md.

describe("GET /health", () => {
  it("reports ok and the configured tenant mode", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, tenantMode: "single" });
  });
});

describe("POST /api/chat", () => {
  it("rejects a request with no session header", async () => {
    const response = await SELF.fetch("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects an empty message", async () => {
    const response = await SELF.fetch("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", [CHAT_SESSION_HEADER]: crypto.randomUUID() },
      body: JSON.stringify({ message: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("degrades gracefully (200, with the retrieval-unavailable fallback) when AI Search can't be reached", async () => {
    const response = await SELF.fetch("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", [CHAT_SESSION_HEADER]: crypto.randomUUID() },
      body: JSON.stringify({ message: "What does Jorge do?" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reply).toContain("couldn't reach my notes");
    expect(body.sources).toEqual([]);
  });
});

describe("GET /webhooks/whatsapp (verification handshake)", () => {
  it("echoes the challenge when the verify token matches", async () => {
    const url =
      "https://example.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=echo-me-123";
    const response = await SELF.fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("echo-me-123");
  });

  it("returns 403 when the verify token is wrong", async () => {
    const url =
      "https://example.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=echo-me-123";
    const response = await SELF.fetch(url);
    expect(response.status).toBe(403);
  });

  it("returns 403 when hub.mode isn't subscribe", async () => {
    const url =
      "https://example.com/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=test-verify-token&hub.challenge=echo-me-123";
    const response = await SELF.fetch(url);
    expect(response.status).toBe(403);
  });
});

describe("POST /webhooks/whatsapp (signature verification)", () => {
  it("rejects a request with no signature header", async () => {
    const response = await SELF.fetch("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entry: [] }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a request with an incorrect signature", async () => {
    const response = await SELF.fetch("https://example.com/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
      body: JSON.stringify({ entry: [] }),
    });
    expect(response.status).toBe(401);
  });
});

describe("POST /webhooks/telegram", () => {
  it("rejects a request with no secret token header", async () => {
    const response = await SELF.fetch("https://example.com/webhooks/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret token", async () => {
    const response = await SELF.fetch("https://example.com/webhooks/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "wrong" },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts a request with the correct secret token and acks fast", async () => {
    const response = await SELF.fetch("https://example.com/webhooks/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "test-telegram-webhook-secret",
      },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(response.status).toBe(200);
  });
});

describe("/admin/tenants", () => {
  it("is not available in single-tenant mode", async () => {
    const response = await SELF.fetch("https://example.com/admin/tenants", {
      headers: { authorization: "Bearer test-admin-key" },
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("not_available_in_single_tenant_mode");
  });
});

describe("/admin/conversations/:conversationId", () => {
  it("is not available in single-tenant mode", async () => {
    const response = await SELF.fetch("https://example.com/admin/conversations/some-id", {
      headers: { authorization: "Bearer test-admin-key" },
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("not_available_in_single_tenant_mode");
  });

});

describe("unknown routes", () => {
  it("returns a JSON 404", async () => {
    const response = await SELF.fetch("https://example.com/nope");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not_found");
  });
});
