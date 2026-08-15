import { Hono } from "hono";
import type { Env } from "../env.js";

export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get("/health", (c) => {
  const env = c.env;
  return c.json({
    ok: true,
    tenantMode: env.TENANT_MODE,
    bindings: {
      aiSearch: Boolean(env.AI_SEARCH),
      db: Boolean(env.DB),
      conversation: Boolean(env.CONVERSATION),
      budget: Boolean(env.BUDGET),
      rateLimiter: Boolean(env.RATE_LIMITER),
    },
  });
});
