import { describe, expect, it } from "vitest";
import type { BotPersona, SupportedLocale } from "@sitebot/shared";
import { contactActions } from "../../../src/core/actions.js";
import { isContactIntent } from "../../../src/core/contactIntent.js";

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

const LOCALES: SupportedLocale[] = ["en", "es", "zh"];

describe("contactActions", () => {
  it.each(LOCALES)("returns non-empty chips with non-empty label/send for %s", (locale) => {
    const actions = contactActions(persona, locale);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.label.trim()).not.toBe("");
      expect(action.send.trim()).not.toBe("");
    }
  });

  it.each(LOCALES)(
    "every chip's send text satisfies isContactIntent for %s — otherwise a click loops back into the same deflection",
    (locale) => {
      const actions = contactActions(persona, locale);
      for (const action of actions) {
        expect(isContactIntent(action.send)).toBe(true);
      }
    },
  );

  it("returns different copy per locale", () => {
    const en = contactActions(persona, "en").map((a) => a.label);
    const es = contactActions(persona, "es").map((a) => a.label);
    const zh = contactActions(persona, "zh").map((a) => a.label);
    expect(en).not.toEqual(es);
    expect(en).not.toEqual(zh);
    expect(es).not.toEqual(zh);
  });
});
