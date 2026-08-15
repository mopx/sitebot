import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook } from "../../../../src/channels/whatsapp/parse.js";
import textFixture from "../../../fixtures/whatsapp-text.json" with { type: "json" };
import statusFixture from "../../../fixtures/whatsapp-status.json" with { type: "json" };
import imageFixture from "../../../fixtures/whatsapp-image.json" with { type: "json" };

function withFreshTimestamp(fixture: unknown, now: number): string {
  return JSON.stringify(fixture).replace("__TIMESTAMP__", String(Math.floor(now / 1000)));
}

describe("parseWhatsAppWebhook", () => {
  it("extracts a single text message", () => {
    const now = Date.now();
    const result = parseWhatsAppWebhook(withFreshTimestamp(textFixture, now), now);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      channel: "whatsapp",
      eventId: "wamid.TEST123",
      senderId: "15559998888",
      text: "What services does Jorge offer?",
    });
    expect(result.unsupportedSenders).toHaveLength(0);
  });

  it("returns no messages for a delivery-status payload", () => {
    const result = parseWhatsAppWebhook(JSON.stringify(statusFixture));
    expect(result.messages).toHaveLength(0);
    expect(result.unsupportedSenders).toHaveLength(0);
  });

  it("flags a non-text message as unsupported instead of parsing it as a message", () => {
    const now = Date.now();
    const result = parseWhatsAppWebhook(withFreshTimestamp(imageFixture, now), now);
    expect(result.messages).toHaveLength(0);
    expect(result.unsupportedSenders).toEqual(["15559998888"]);
  });

  it("does not throw on malformed JSON", () => {
    expect(() => parseWhatsAppWebhook("not json")).not.toThrow();
    expect(parseWhatsAppWebhook("not json").messages).toHaveLength(0);
  });

  it("does not throw on valid JSON missing the expected shape", () => {
    const result = parseWhatsAppWebhook(JSON.stringify({ unexpected: true }));
    expect(result.messages).toHaveLength(0);
  });

  it("drops a message older than the staleness window", () => {
    const now = Date.now();
    const sixMinutesAgo = now - 6 * 60 * 1000;
    const result = parseWhatsAppWebhook(withFreshTimestamp(textFixture, sixMinutesAgo), now);
    expect(result.messages).toHaveLength(0);
  });

  it("parses multiple messages in one payload", () => {
    const now = Date.now();
    const fixture = JSON.parse(withFreshTimestamp(textFixture, now));
    const value = fixture.entry[0].changes[0].value;
    value.messages.push({
      ...value.messages[0],
      id: "wamid.TEST456",
      text: { body: "And what about mobile apps?" },
    });
    const result = parseWhatsAppWebhook(JSON.stringify(fixture), now);
    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((m) => m.eventId)).toEqual(["wamid.TEST123", "wamid.TEST456"]);
  });
});
