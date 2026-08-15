import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../src/core/prompt.js";
import type { BotPersona } from "@sitebot/shared";
import type { RetrievedChunk } from "../../../src/core/retrieval.js";

const persona: BotPersona = {
  botName: "Jorge's Assistant",
  subjectName: "Jorge",
  shortDescription: "desc",
  siteUrl: "https://jorgeyau.com",
  supportedLocales: ["en", "es"],
  defaultLocale: "en",
  systemPromptIntro: "You are the assistant for jorgeyau.com.",
  fallbackMessage: { en: "No info on that.", es: "Sin informacion." },
  contactCta: { en: "Reach out.", es: "Contacta." },
};

const chunks: RetrievedChunk[] = [
  {
    text: "Jorge builds React Native apps.",
    source: { url: "https://jorgeyau.com#skills" },
    score: 0.9,
  },
];

describe("buildSystemPrompt", () => {
  it("includes the persona's role intro", () => {
    const prompt = buildSystemPrompt({ persona, chunks, locale: "en", channel: "web" });
    expect(prompt).toContain(persona.systemPromptIntro);
  });

  it("wraps retrieved chunks in a <context> block with their source URL", () => {
    const prompt = buildSystemPrompt({ persona, chunks, locale: "en", channel: "web" });
    expect(prompt).toContain("<context>");
    expect(prompt).toContain("</context>");
    expect(prompt).toContain(chunks[0]!.text);
    expect(prompt).toContain(chunks[0]!.source.url);
  });

  it("uses a placeholder context block when no chunks were retrieved", () => {
    const prompt = buildSystemPrompt({ persona, chunks: [], locale: "en", channel: "web" });
    expect(prompt).toContain("No matching content was found");
  });

  it("differs in style guidance between whatsapp and web channels", () => {
    const whatsapp = buildSystemPrompt({ persona, chunks, locale: "en", channel: "whatsapp" });
    const web = buildSystemPrompt({ persona, chunks, locale: "en", channel: "web" });
    expect(whatsapp).toContain("No headings, no markdown links");
    expect(web).toContain("small amount of markdown is fine");
  });

  it("omits the <conversation_summary> section when no summary is given", () => {
    const prompt = buildSystemPrompt({ persona, chunks, locale: "en", channel: "web" });
    expect(prompt).not.toContain("<conversation_summary>");
  });

  it("includes the <conversation_summary> section when a summary is given", () => {
    const prompt = buildSystemPrompt({
      persona,
      chunks,
      locale: "en",
      channel: "web",
      summary: "User asked about mobile apps.",
    });
    expect(prompt).toContain("<conversation_summary>");
    expect(prompt).toContain("User asked about mobile apps.");
  });

  it("states the resolved locale in the language instruction", () => {
    const prompt = buildSystemPrompt({ persona, chunks, locale: "es", channel: "web" });
    expect(prompt).toContain("Reply in es");
  });

  it("never leaks emoji guidance being violated — the style section forbids emoji", () => {
    const prompt = buildSystemPrompt({ persona, chunks, locale: "en", channel: "web" });
    expect(prompt).toContain("No emoji");
  });

  it("instructs treating a matching need as a lead, not an off-topic redirect", () => {
    const prompt = buildSystemPrompt({ persona, chunks, locale: "en", channel: "web" });
    expect(prompt).toContain("that is a lead, not an off-topic");
    expect(prompt).toContain("Never tell someone to find help elsewhere for something Jorge does.");
  });
});
