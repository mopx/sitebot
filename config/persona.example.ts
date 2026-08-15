/**
 * Template for adapting sitebot to a different site/person.
 *
 * `config/persona.ts` (checked in, alongside this file) holds the live values
 * for the reference deployment (jorgeyau.com). To point this bot at your own
 * site instead:
 *   1. Overwrite `config/persona.ts` with a copy of this file.
 *   2. Fill in every field below for your own site.
 *   3. Point AI Search at your own site (see docs/SETUP.md).
 *   4. Deploy your own Worker with your own secrets.
 *
 * Nothing else in this codebase needs to change to retarget the bot — every
 * persona-specific string flows through this file. See docs/ADAPTING.md.
 */

import { definePersona } from "@sitebot/shared";

export const persona = definePersona({
  botName: "Site Assistant",
  subjectName: "the site owner",
  shortDescription: "AI assistant that answers questions using this site's own content.",
  siteUrl: "https://example.com",

  supportedLocales: ["en"],
  defaultLocale: "en",

  systemPromptIntro:
    "You are the assistant for {siteUrl}. Answer questions about {subjectName} " +
    "using only the retrieved context below — never your general knowledge.",

  fallbackMessage: {
    en: "I don't have anything on the site about that yet.",
  },

  contactCta: {
    en: "You can reach out directly at contact@example.com.",
  },
});
