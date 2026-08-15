-- Tenant registry for multi-tenant (SaaS) mode. Unused in single-tenant mode.
-- Applied with: pnpm db:migrate:local / db:migrate:remote (see package.json).

CREATE TABLE IF NOT EXISTS tenants (
  id                  TEXT PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),

  -- BotPersona fields (see shared/src/persona.ts) — kept flat rather than as
  -- a JSON blob so simple lookups/edits don't need JSON functions.
  bot_name            TEXT NOT NULL,
  subject_name        TEXT NOT NULL,
  short_description   TEXT NOT NULL,
  site_url            TEXT NOT NULL,
  supported_locales   TEXT NOT NULL,               -- JSON array, e.g. ["en","es"]
  default_locale      TEXT NOT NULL,
  system_prompt_intro TEXT NOT NULL,
  fallback_message    TEXT NOT NULL,                -- JSON object keyed by locale
  contact_cta         TEXT NOT NULL,                -- JSON object keyed by locale

  ai_search_instance  TEXT NOT NULL,
  claude_model        TEXT,

  created_at          INTEGER NOT NULL
);

-- Per-channel credentials, encrypted at rest (AES-GCM, src/lib/crypto.ts) with
-- the deployment's TENANT_SECRETS_KEY secret. `encrypted_config` is a JSON
-- string: {"iv": "<base64>", "data": "<base64>"}. Never store plaintext here.
CREATE TABLE IF NOT EXISTS tenant_channel_credentials (
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  encrypted_config     TEXT NOT NULL,
  updated_at          INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, channel)
);

-- Lets the WhatsApp webhook cross-check "does this phone_number_id actually
-- belong to the tenant the URL path claims?" without decrypting every
-- tenant's credentials to find out. Populated alongside the encrypted row
-- above; the phone number id itself is not secret (Meta returns it to
-- anyone who messages the number).
CREATE TABLE IF NOT EXISTS tenant_whatsapp_phone_lookup (
  phone_number_id     TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);
