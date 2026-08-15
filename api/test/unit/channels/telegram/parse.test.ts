import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "../../../../src/channels/telegram/parse.js";
import updateFixture from "../../../fixtures/telegram-update.json" with { type: "json" };

describe("parseTelegramUpdate", () => {
  it("extracts a text message", () => {
    const result = parseTelegramUpdate(JSON.stringify(updateFixture));
    expect(result).toMatchObject({
      channel: "telegram",
      eventId: "900000001",
      senderId: "123456789",
      text: "What services does Jorge offer?",
    });
  });

  it("uses update_id as the dedup key, not message_id", () => {
    const result = parseTelegramUpdate(JSON.stringify(updateFixture));
    expect(result?.eventId).toBe(String(updateFixture.update_id));
  });

  it("ignores edited_message updates", () => {
    const edited = { update_id: 2, edited_message: updateFixture.message };
    expect(parseTelegramUpdate(JSON.stringify(edited))).toBeNull();
  });

  it("ignores updates with no text (e.g. a photo)", () => {
    const noText = { update_id: 3, message: { ...updateFixture.message, text: undefined } };
    expect(parseTelegramUpdate(JSON.stringify(noText))).toBeNull();
  });

  it("does not throw on malformed JSON", () => {
    expect(() => parseTelegramUpdate("not json")).not.toThrow();
    expect(parseTelegramUpdate("not json")).toBeNull();
  });
});
