import { describe, expect, it } from "vitest";
import { isGreeting, greetingCopy } from "../../../src/core/greeting.js";
import type { BotPersona } from "@sitebot/shared";

describe("isGreeting", () => {
  it.each(["hi", "Hi!", "hey", "HELLO", "hola", "¡Hola!", "你好", " hey  "])(
    "treats %j as a bare greeting",
    (text) => {
      expect(isGreeting(text)).toBe(true);
    },
  );

  it.each([
    "hi, does Jorge do mobile apps?",
    "hello there, what technologies does Jorge use",
    "hey can you tell me about his availability",
    "what is the capital of France?",
    "",
  ])("does not treat %j as a bare greeting", (text) => {
    expect(isGreeting(text)).toBe(false);
  });
});

describe("greetingCopy", () => {
  const persona: BotPersona = {
    botName: "Jorge's Assistant",
    subjectName: "Jorge",
    shortDescription: "desc",
    siteUrl: "https://jorgeyau.com",
    supportedLocales: ["en", "es", "zh"],
    defaultLocale: "en",
    systemPromptIntro: "intro",
    fallbackMessage: { en: "No info.", es: "Sin info." },
    contactCta: { en: "Reach out.", es: "Contacta." },
  };

  it("mentions the persona's subjectName in the resolved locale", () => {
    expect(greetingCopy(persona, "en")).toContain("Jorge");
    expect(greetingCopy(persona, "es")).toContain("Jorge");
    expect(greetingCopy(persona, "zh")).toContain("Jorge");
  });
});
