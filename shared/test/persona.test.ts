import { describe, expect, it } from "vitest";
import { definePersona } from "../src/persona.js";

describe("definePersona", () => {
  it("returns the persona object unchanged (identity helper for type inference only)", () => {
    const persona = {
      botName: "Test Bot",
      subjectName: "Test",
      shortDescription: "desc",
      siteUrl: "https://example.com",
      supportedLocales: ["en"] as const,
      defaultLocale: "en" as const,
      systemPromptIntro: "intro",
      fallbackMessage: { en: "no info" },
      contactCta: { en: "contact us" },
    };
    expect(definePersona(persona)).toBe(persona);
  });
});
