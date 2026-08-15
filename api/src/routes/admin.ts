import { Hono } from "hono";
import { z } from "zod";
import type { ChatTurn } from "@sitebot/shared";
import type { Env } from "../env.js";
import { createTenantStore } from "../tenancy/tenant-store.js";
import { timingSafeEqual } from "../lib/timingSafe.js";

/**
 * `ConversationDO.getHistory` is a public method on the DO class but isn't
 * part of `ConversationRpc` (core/pipeline.ts) — that interface only
 * describes what the pipeline needs. This route talks to the DO directly,
 * so it declares just the one extra method it uses.
 */
interface ConversationHistoryRpc {
  getHistory(historyWindow: number): Promise<ChatTurn[]>;
}

export const adminRoute = new Hono<{ Bindings: Env }>();

/**
 * Minimal tenant-management API for SaaS (TENANT_MODE=multi) deployments —
 * see docs/SAAS.md. This is a JSON API only: no dashboard UI is included.
 * A future admin UI (or `ant`/curl scripts) would call exactly these routes.
 * Deliberately NOT built here: billing/subscriptions (Stripe or similar is
 * the natural next step — see docs/SAAS.md §Not included), self-serve
 * signup, or per-tenant usage dashboards (Workers Logs + the BudgetDO
 * counters are the observability surface for now).
 */
adminRoute.use("/admin/*", async (c, next) => {
  if (c.env.TENANT_MODE !== "multi") {
    return c.json({ error: "not_available_in_single_tenant_mode" }, 404);
  }
  const adminKey = c.env.ADMIN_API_KEY;
  if (!adminKey) {
    return c.json({ error: "admin_api_not_configured" }, 500);
  }
  const auth = c.req.header("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!provided || !timingSafeEqual(provided, adminKey)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
});

const localeSchema = z.enum(["en", "es", "zh"]);

const channelConfigSchema = {
  whatsapp: z
    .object({
      accessToken: z.string().min(1),
      phoneNumberId: z.string().min(1),
      appSecret: z.string().min(1),
      verifyToken: z.string().min(1),
    })
    .optional(),
  telegram: z
    .object({
      botToken: z.string().min(1),
      webhookSecret: z.string().min(1),
    })
    .optional(),
};

const tenantInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens only"),
  status: z.enum(["active", "disabled"]).default("active"),
  botName: z.string().min(1),
  subjectName: z.string().min(1),
  shortDescription: z.string().min(1),
  siteUrl: z.string().url(),
  supportedLocales: z.array(localeSchema).min(1),
  defaultLocale: localeSchema,
  systemPromptIntro: z.string().min(1),
  fallbackMessage: z.record(localeSchema, z.string()),
  contactCta: z.record(localeSchema, z.string()),
  aiSearchInstance: z.string().min(1),
  claudeModel: z.string().optional(),
  ...channelConfigSchema,
});

const tenantPatchSchema = tenantInputSchema.partial();

adminRoute.get("/admin/tenants", async (c) => {
  const tenants = await createTenantStore(c.env).list();
  // Never return channel credentials from a list endpoint.
  return c.json({
    tenants: tenants.map(({ whatsapp, telegram, ...rest }) => ({
      ...rest,
      whatsappConnected: Boolean(whatsapp),
      telegramConnected: Boolean(telegram),
    })),
  });
});

adminRoute.post("/admin/tenants", async (c) => {
  const parsed = tenantInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  }
  if (!parsed.data.supportedLocales.includes(parsed.data.defaultLocale)) {
    return c.json(
      { error: "invalid_request", issues: ["defaultLocale must be in supportedLocales"] },
      400,
    );
  }
  const tenant = await createTenantStore(c.env).create(parsed.data);
  const { whatsapp, telegram, ...rest } = tenant;
  return c.json(
    {
      tenant: {
        ...rest,
        whatsappConnected: Boolean(whatsapp),
        telegramConnected: Boolean(telegram),
      },
    },
    201,
  );
});

adminRoute.patch("/admin/tenants/:id", async (c) => {
  const parsed = tenantPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  }
  try {
    const tenant = await createTenantStore(c.env).update(c.req.param("id"), parsed.data);
    const { whatsapp, telegram, ...rest } = tenant;
    return c.json({
      tenant: {
        ...rest,
        whatsappConnected: Boolean(whatsapp),
        telegramConnected: Boolean(telegram),
      },
    });
  } catch {
    return c.json({ error: "tenant_not_found" }, 404);
  }
});

/**
 * Reads a conversation's stored history. `:conversationId` is the same
 * opaque id `/api/chat` and the webhook routes already return
 * (`${tenantId}:${channel}:${senderHash}` — see core/deps.ts#conversationKey)
 * — it doubles as the ConversationDO's name, so no separate lookup table is
 * needed. Debugging/support tool only: this returns raw message text, which
 * is exactly why it lives behind the same admin bearer auth as tenant
 * management, not a public route.
 */
adminRoute.get("/admin/conversations/:conversationId", async (c) => {
  const conversationId = c.req.param("conversationId");
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const id = c.env.CONVERSATION.idFromName(conversationId);
  const stub = c.env.CONVERSATION.get(id) as unknown as ConversationHistoryRpc;
  const history = await stub.getHistory(limit);
  return c.json({ conversationId, history });
});
