import type { BotPersona } from "./persona.js";

/**
 * Multi-tenant (SaaS) model. A `Tenant` IS a `BotPersona` plus the operational
 * fields needed to route and bill a single customer's bot: which AI Search
 * instance backs it, which model it uses, and its channel credentials.
 *
 * Two deployment modes share this type (see api/src/tenancy/tenant-store.ts):
 *   - "single"  — one hardcoded Tenant built from /config/persona.ts + env vars.
 *                 This is the simple "fork and deploy one bot" path.
 *   - "multi"   — Tenants are rows in D1, created/edited via the /admin API.
 *                 This is the SaaS path: many customers, one Worker.
 */
export interface Tenant extends BotPersona {
  id: string;
  /** URL-safe, used in webhook paths (/webhooks/whatsapp/:slug) and the widget's ?tenant= param. */
  slug: string;
  status: "active" | "disabled";
  /** Name of the AI Search instance indexing this tenant's site. */
  aiSearchInstance: string;
  /** Overrides the deployment default model, e.g. to give one tenant Sonnet instead of Haiku. */
  claudeModel?: string;
  whatsapp?: WhatsAppChannelConfig;
  telegram?: TelegramChannelConfig;
  createdAt: number;
}

export interface WhatsAppChannelConfig {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
}

export interface TelegramChannelConfig {
  botToken: string;
  webhookSecret: string;
}

/** Input to create a tenant — `id`/`createdAt` are assigned by the store. */
export type TenantInput = Omit<Tenant, "id" | "createdAt">;

export type TenantPatch = Partial<Omit<Tenant, "id" | "createdAt">>;
