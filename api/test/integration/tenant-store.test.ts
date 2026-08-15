import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { createTenantStore } from "../../src/tenancy/tenant-store.js";
import type { TenantInput } from "@sitebot/shared";

// Mirrors migrations/0001_init.sql. Duplicated here (rather than read from
// disk) because the Workers test runtime doesn't have Node fs access to the
// migrations directory; vitest-pool-workers does not auto-apply D1
// migrations to the test binding, so each test file that needs schema
// applies it itself. Keep this in sync if the migration changes.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
    bot_name TEXT NOT NULL, subject_name TEXT NOT NULL, short_description TEXT NOT NULL,
    site_url TEXT NOT NULL, supported_locales TEXT NOT NULL, default_locale TEXT NOT NULL,
    system_prompt_intro TEXT NOT NULL, fallback_message TEXT NOT NULL, contact_cta TEXT NOT NULL,
    ai_search_instance TEXT NOT NULL, claude_model TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tenant_channel_credentials (
    tenant_id TEXT NOT NULL, channel TEXT NOT NULL, encrypted_config TEXT NOT NULL,
    updated_at INTEGER NOT NULL, PRIMARY KEY (tenant_id, channel)
  );
  CREATE TABLE IF NOT EXISTS tenant_whatsapp_phone_lookup (
    phone_number_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL
  );
`;

const TEST_SECRETS_KEY = "hqhZ8sT1a5t3aG4nH1u1cE0kQx2yZb8wJvV3nX9pQmA=";

beforeAll(async () => {
  for (const statement of SCHEMA.split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
});

const baseInput: TenantInput = {
  slug: "acme",
  status: "active",
  botName: "Acme Bot",
  subjectName: "Acme",
  shortDescription: "desc",
  siteUrl: "https://acme.example.com",
  supportedLocales: ["en"],
  defaultLocale: "en",
  systemPromptIntro: "intro",
  fallbackMessage: { en: "No info." },
  contactCta: { en: "Contact us." },
  aiSearchInstance: "acme-instance",
};

describe("D1TenantStore", () => {
  it("creates a tenant and retrieves it by slug", async () => {
    const store = createTenantStore({
      ...env,
      TENANT_MODE: "multi",
      TENANT_SECRETS_KEY: TEST_SECRETS_KEY,
    } as never);
    const created = await store.create({ ...baseInput, slug: `create-${crypto.randomUUID()}` });
    const found = await store.getBySlug(created.slug);
    expect(found).toMatchObject({ id: created.id, botName: "Acme Bot" });
  });

  it("returns null for an unknown slug", async () => {
    const store = createTenantStore({
      ...env,
      TENANT_MODE: "multi",
      TENANT_SECRETS_KEY: TEST_SECRETS_KEY,
    } as never);
    expect(await store.getBySlug("does-not-exist")).toBeNull();
  });

  it("encrypts WhatsApp credentials at rest and can resolve a tenant by phone_number_id", async () => {
    const store = createTenantStore({
      ...env,
      TENANT_MODE: "multi",
      TENANT_SECRETS_KEY: TEST_SECRETS_KEY,
    } as never);
    const phoneNumberId = `phone-${crypto.randomUUID()}`;
    const created = await store.create({
      ...baseInput,
      slug: `wa-${crypto.randomUUID()}`,
      whatsapp: {
        accessToken: "secret-token",
        phoneNumberId,
        appSecret: "app-secret",
        verifyToken: "verify-token",
      },
    });

    // The row in tenant_channel_credentials must not contain the plaintext token.
    const row = await env.DB.prepare(
      "SELECT encrypted_config FROM tenant_channel_credentials WHERE tenant_id = ?",
    )
      .bind(created.id)
      .first<{ encrypted_config: string }>();
    expect(row?.encrypted_config).toBeDefined();
    expect(row!.encrypted_config).not.toContain("secret-token");

    const found = await store.getByWhatsAppPhoneNumberId(phoneNumberId);
    expect(found?.id).toBe(created.id);
    expect(found?.whatsapp?.accessToken).toBe("secret-token");
  });

  it("update() merges a patch without clobbering unrelated fields", async () => {
    const store = createTenantStore({
      ...env,
      TENANT_MODE: "multi",
      TENANT_SECRETS_KEY: TEST_SECRETS_KEY,
    } as never);
    const created = await store.create({ ...baseInput, slug: `update-${crypto.randomUUID()}` });
    const updated = await store.update(created.id, { botName: "Renamed Bot" });
    expect(updated.botName).toBe("Renamed Bot");
    expect(updated.siteUrl).toBe(baseInput.siteUrl); // untouched
  });

  it("list() DOES include decrypted credentials (redaction is the /admin route's job, not the store's — see routes/admin.ts)", async () => {
    const store = createTenantStore({
      ...env,
      TENANT_MODE: "multi",
      TENANT_SECRETS_KEY: TEST_SECRETS_KEY,
    } as never);
    const slug = `list-${crypto.randomUUID()}`;
    await store.create({
      ...baseInput,
      slug,
      whatsapp: {
        accessToken: "secret-token",
        phoneNumberId: "p1",
        appSecret: "s",
        verifyToken: "v",
      },
    });
    const tenants = await store.list();
    const created = tenants.find((t) => t.slug === slug);
    expect(created?.whatsapp?.accessToken).toBe("secret-token");
  });
});
