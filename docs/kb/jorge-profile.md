<!--
  Seed knowledge document for the jorgeyau.com AI Search instance — see
  docs/SETUP.md §1. jorgeyau.com is currently a single-route, mostly
  client-rendered site, so its crawled index alone is thin; this document
  gives the bot reliable, curated ground truth to retrieve from, in addition
  to whatever the crawler picks up.

  Drafted from the content actually published on jorgeyau.com's homepage at
  the time this repo was set up (bio tagline, skills list, and project
  references, as rendered client-side) — nothing here is invented. It's a
  starting point, not a finished bio: expand it with anything the bot should
  reliably know that isn't likely to be crawlable (rates policy, more project
  detail, preferred contact method, timezone/availability specifics).

  Upload with: npx wrangler ai-search ... (see docs/SETUP.md), or via the
  AI Search dashboard's item uploader. Keep jorge-profile.es.md in sync for
  Spanish queries — see docs/ARCHITECTURE.md's note on cross-lingual
  retrieval.
-->

# Jorge Yau

Jorge Yau is a full-stack software developer, currently available for new projects.

## Services / skills

- **Back-end APIs and integrations:** Node.js, REST, GraphQL
- **Web front-end:** React, Next.js
- **Mobile apps:** React Native, Titanium SDK, native platform integrations — cross-platform mobile
  apps with a shared back-end
- **Full-stack development with Ruby on Rails**
- **E-commerce & CMS platforms:** Shopify, Squarespace, WooCommerce, Magento, Directus, Craft, Drupal
- **Performance, accessibility, and SEO** as a standing part of front-end work, not a separate add-on

## Selected project references

- Work connected to the **Smithsonian Tropical Research Institute**.
- An **online layaway store** with **promotional mini apps** — a full-stack e-commerce build
  combining a customer-facing store with smaller promotional/campaign applications.

## Availability & contact

Jorge is currently open to new project inquiries. For specifics on availability, timelines, or rates,
direct people to jorgeyau.com's contact section — this bot does not state prices or firm availability
dates unless they're explicitly present in retrieved content (see the deflection/safety rules in
`api/src/core/prompt.ts`).

## Languages

jorgeyau.com is published in English, Spanish, and Chinese (`?lang=en|es|zh`). This bot mirrors
that: see `config/persona.ts`'s `supportedLocales`.
