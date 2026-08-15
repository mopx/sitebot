import type {
  Tenant,
  TenantInput,
  TenantPatch,
  SupportedLocale,
  WhatsAppChannelConfig,
  TelegramChannelConfig,
} from "@sitebot/shared";
import type { Env } from "../env.js";
import { encryptJson, decryptJson } from "../lib/crypto.js";
import { persona as singleTenantPersona } from "../persona.js";

/**
 * Resolves and (in multi-tenant mode) manages tenants. Every route that needs
 * "which bot is this?" goes through this interface — never queries D1 or
 * reads env vars directly — so single-tenant and multi-tenant mode are
 * genuinely interchangeable everywhere else in the codebase.
 */
export interface TenantStore {
  getBySlug(slug: string): Promise<Tenant | null>;
  getByWhatsAppPhoneNumberId(phoneNumberId: string): Promise<Tenant | null>;
  list(): Promise<Tenant[]>;
  create(input: TenantInput): Promise<Tenant>;
  update(id: string, patch: TenantPatch): Promise<Tenant>;
}

export function createTenantStore(env: Env): TenantStore {
  if (env.TENANT_MODE === "multi") {
    if (!env.TENANT_SECRETS_KEY) {
      throw new Error("TENANT_MODE=multi requires the TENANT_SECRETS_KEY secret to be set");
    }
    return new D1TenantStore(env.DB, env.TENANT_SECRETS_KEY);
  }
  return new SingleTenantStore(env);
}

/**
 * The simple "fork and deploy one bot" path: a single Tenant assembled from
 * /config/persona.ts and env secrets, with no D1 dependency. `d1_databases`
 * in wrangler.jsonc can be left as the placeholder in this mode — it's never
 * touched. Every write method throws: there is nothing to administer.
 */
class SingleTenantStore implements TenantStore {
  private readonly tenant: Tenant;

  constructor(env: Env) {
    this.tenant = {
      ...singleTenantPersona,
      id: env.SINGLE_TENANT_SLUG,
      slug: env.SINGLE_TENANT_SLUG,
      status: "active",
      aiSearchInstance: env.AI_SEARCH_INSTANCE,
      claudeModel: env.CLAUDE_MODEL,
      createdAt: 0,
      whatsapp:
        env.WHATSAPP_ACCESS_TOKEN &&
        env.WHATSAPP_PHONE_NUMBER_ID &&
        env.WHATSAPP_APP_SECRET &&
        env.WHATSAPP_VERIFY_TOKEN
          ? {
              accessToken: env.WHATSAPP_ACCESS_TOKEN,
              phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
              appSecret: env.WHATSAPP_APP_SECRET,
              verifyToken: env.WHATSAPP_VERIFY_TOKEN,
            }
          : undefined,
      telegram:
        env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET
          ? { botToken: env.TELEGRAM_BOT_TOKEN, webhookSecret: env.TELEGRAM_WEBHOOK_SECRET }
          : undefined,
    };
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    return slug === this.tenant.slug ? this.tenant : null;
  }

  async getByWhatsAppPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
    return this.tenant.whatsapp?.phoneNumberId === phoneNumberId ? this.tenant : null;
  }

  async list(): Promise<Tenant[]> {
    return [this.tenant];
  }

  async create(): Promise<Tenant> {
    throw new Error(
      "Tenant management is not available in single-tenant mode (TENANT_MODE=single)",
    );
  }

  async update(): Promise<Tenant> {
    throw new Error(
      "Tenant management is not available in single-tenant mode (TENANT_MODE=single)",
    );
  }
}

interface TenantRow {
  id: string;
  slug: string;
  status: "active" | "disabled";
  bot_name: string;
  subject_name: string;
  short_description: string;
  site_url: string;
  supported_locales: string;
  default_locale: string;
  system_prompt_intro: string;
  fallback_message: string;
  contact_cta: string;
  ai_search_instance: string;
  claude_model: string | null;
  created_at: number;
}

interface CredentialRow {
  channel: "whatsapp" | "telegram";
  encrypted_config: string;
}

/** The SaaS path: tenants are rows in D1, channel credentials encrypted at rest. */
class D1TenantStore implements TenantStore {
  constructor(
    private readonly db: D1Database,
    private readonly secretsKey: string,
  ) {}

  private async hydrate(row: TenantRow): Promise<Tenant> {
    const credRows = await this.db
      .prepare(
        "SELECT channel, encrypted_config FROM tenant_channel_credentials WHERE tenant_id = ?",
      )
      .bind(row.id)
      .all<CredentialRow>();

    let whatsapp: Tenant["whatsapp"];
    let telegram: Tenant["telegram"];
    for (const cred of credRows.results ?? []) {
      const decrypted = await decryptJson<Record<string, string>>(
        this.secretsKey,
        JSON.parse(cred.encrypted_config),
      );
      if (cred.channel === "whatsapp") whatsapp = decrypted as unknown as Tenant["whatsapp"];
      if (cred.channel === "telegram") telegram = decrypted as unknown as Tenant["telegram"];
    }

    return {
      id: row.id,
      slug: row.slug,
      status: row.status,
      botName: row.bot_name,
      subjectName: row.subject_name,
      shortDescription: row.short_description,
      siteUrl: row.site_url,
      supportedLocales: JSON.parse(row.supported_locales) as SupportedLocale[],
      defaultLocale: row.default_locale as SupportedLocale,
      systemPromptIntro: row.system_prompt_intro,
      fallbackMessage: JSON.parse(row.fallback_message),
      contactCta: JSON.parse(row.contact_cta),
      aiSearchInstance: row.ai_search_instance,
      claudeModel: row.claude_model ?? undefined,
      createdAt: row.created_at,
      whatsapp,
      telegram,
    };
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db
      .prepare("SELECT * FROM tenants WHERE slug = ?")
      .bind(slug)
      .first<TenantRow>();
    return row ? this.hydrate(row) : null;
  }

  async getByWhatsAppPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
    const lookup = await this.db
      .prepare("SELECT tenant_id FROM tenant_whatsapp_phone_lookup WHERE phone_number_id = ?")
      .bind(phoneNumberId)
      .first<{ tenant_id: string }>();
    if (!lookup) return null;
    const row = await this.db
      .prepare("SELECT * FROM tenants WHERE id = ?")
      .bind(lookup.tenant_id)
      .first<TenantRow>();
    return row ? this.hydrate(row) : null;
  }

  async list(): Promise<Tenant[]> {
    const rows = await this.db
      .prepare("SELECT * FROM tenants ORDER BY created_at DESC")
      .all<TenantRow>();
    return Promise.all((rows.results ?? []).map((row) => this.hydrate(row)));
  }

  async create(input: TenantInput): Promise<Tenant> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await this.db
      .prepare(
        `INSERT INTO tenants
           (id, slug, status, bot_name, subject_name, short_description, site_url,
            supported_locales, default_locale, system_prompt_intro, fallback_message,
            contact_cta, ai_search_instance, claude_model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.slug,
        input.status,
        input.botName,
        input.subjectName,
        input.shortDescription,
        input.siteUrl,
        JSON.stringify(input.supportedLocales),
        input.defaultLocale,
        input.systemPromptIntro,
        JSON.stringify(input.fallbackMessage),
        JSON.stringify(input.contactCta),
        input.aiSearchInstance,
        input.claudeModel ?? null,
        createdAt,
      )
      .run();

    if (input.whatsapp) await this.putCredentials(id, "whatsapp", input.whatsapp);
    if (input.telegram) await this.putCredentials(id, "telegram", input.telegram);

    const created = await this.getBySlug(input.slug);
    if (!created) throw new Error("tenant_create_failed");
    return created;
  }

  async update(id: string, patch: TenantPatch): Promise<Tenant> {
    const existingRow = await this.db
      .prepare("SELECT * FROM tenants WHERE id = ?")
      .bind(id)
      .first<TenantRow>();
    if (!existingRow) throw new Error("tenant_not_found");
    const existing = await this.hydrate(existingRow);
    const merged: Tenant = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
    };

    await this.db
      .prepare(
        `UPDATE tenants SET slug = ?, status = ?, bot_name = ?, subject_name = ?, short_description = ?,
           site_url = ?, supported_locales = ?, default_locale = ?, system_prompt_intro = ?,
           fallback_message = ?, contact_cta = ?, ai_search_instance = ?, claude_model = ?
         WHERE id = ?`,
      )
      .bind(
        merged.slug,
        merged.status,
        merged.botName,
        merged.subjectName,
        merged.shortDescription,
        merged.siteUrl,
        JSON.stringify(merged.supportedLocales),
        merged.defaultLocale,
        merged.systemPromptIntro,
        JSON.stringify(merged.fallbackMessage),
        JSON.stringify(merged.contactCta),
        merged.aiSearchInstance,
        merged.claudeModel ?? null,
        id,
      )
      .run();

    if (patch.whatsapp !== undefined) await this.putCredentials(id, "whatsapp", patch.whatsapp);
    if (patch.telegram !== undefined) await this.putCredentials(id, "telegram", patch.telegram);

    return merged;
  }

  /** Pass `undefined` to remove the credentials for that channel (e.g. disconnecting WhatsApp). */
  private async putCredentials(
    tenantId: string,
    channel: "whatsapp" | "telegram",
    config: WhatsAppChannelConfig | TelegramChannelConfig | undefined,
  ): Promise<void> {
    if (!config) {
      await this.db
        .prepare("DELETE FROM tenant_channel_credentials WHERE tenant_id = ? AND channel = ?")
        .bind(tenantId, channel)
        .run();
      if (channel === "whatsapp") {
        await this.db
          .prepare("DELETE FROM tenant_whatsapp_phone_lookup WHERE tenant_id = ?")
          .bind(tenantId)
          .run();
      }
      return;
    }

    const encrypted = await encryptJson(this.secretsKey, config);
    await this.db
      .prepare(
        `INSERT INTO tenant_channel_credentials (tenant_id, channel, encrypted_config, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (tenant_id, channel) DO UPDATE SET encrypted_config = excluded.encrypted_config, updated_at = excluded.updated_at`,
      )
      .bind(tenantId, channel, JSON.stringify(encrypted), Date.now())
      .run();

    if (channel === "whatsapp" && "phoneNumberId" in config) {
      const whatsappConfig = config;
      await this.db
        .prepare(
          `INSERT INTO tenant_whatsapp_phone_lookup (phone_number_id, tenant_id) VALUES (?, ?)
           ON CONFLICT (phone_number_id) DO UPDATE SET tenant_id = excluded.tenant_id`,
        )
        .bind(whatsappConfig.phoneNumberId, tenantId)
        .run();
    }
  }
}
