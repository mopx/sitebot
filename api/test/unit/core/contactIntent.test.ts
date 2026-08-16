import { describe, expect, it } from "vitest";
import { isContactIntent } from "../../../src/core/contactIntent.js";

describe("isContactIntent", () => {
  it.each([
    "how do I setup a meeting",
    "can we schedule a call?",
    "I'd like to book a call with Jorge",
    "how can I contact Jorge",
    "how do I get in touch",
    "I want to hire Jorge",
    "¿Cómo puedo agendar una reunión?",
    "quiero contactar a Jorge",
    "我想预约一次会议",
    "怎么联系Jorge",
  ])("treats %j as contact intent", (text) => {
    expect(isContactIntent(text)).toBe(true);
  });

  it.each([
    "what technologies does Jorge use",
    "does Jorge do mobile apps",
    "what is the capital of France?",
    "",
  ])("does not treat %j as contact intent", (text) => {
    expect(isContactIntent(text)).toBe(false);
  });
});
