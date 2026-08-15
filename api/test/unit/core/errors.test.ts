import { describe, expect, it } from "vitest";
import { fallbackCopy, deflectionCopy } from "../../../src/core/errors.js";
import type { BotPersona } from "@sitebot/shared";

const persona: BotPersona = {
  botName: "Test Bot",
  subjectName: "Test Subject",
  shortDescription: "desc",
  siteUrl: "https://example.com",
  supportedLocales: ["en", "es"],
  defaultLocale: "en",
  systemPromptIntro: "intro",
  fallbackMessage: { en: "No info on that.", es: "Sin informacion sobre eso." },
  contactCta: { en: "Reach out at test@example.com.", es: "Contacta a test@example.com." },
};

describe("fallbackCopy", () => {
  it("returns locale-specific copy when available", () => {
    expect(fallbackCopy("rate_limited", "es", "en")).toMatch(/límite/);
  });

  it("falls back to the default locale's copy for an unsupported reason/locale pairing", () => {
    // "stale_message" has empty copy in every locale by design (never surfaced to a user).
    expect(fallbackCopy("stale_message", "en", "en")).toBe("");
  });

  it("never returns undefined", () => {
    for (const reason of [
      "rate_limited",
      "at_capacity",
      "generation_failed",
      "retrieval_failed",
      "unsupported_message_type",
    ] as const) {
      expect(typeof fallbackCopy(reason, "zh", "en")).toBe("string");
    }
  });
});

describe("deflectionCopy", () => {
  it("combines the fallback message and contact CTA for the given locale", () => {
    const copy = deflectionCopy(persona, "en");
    expect(copy).toContain("No info on that.");
    expect(copy).toContain("test@example.com");
  });

  it("falls back to the persona's default locale when the requested locale isn't configured", () => {
    const copy = deflectionCopy(persona, "zh");
    expect(copy).toContain("No info on that.");
  });
});
