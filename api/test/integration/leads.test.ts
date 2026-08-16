import { beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { D1LeadSink, NoopAsanaClient, type AsanaClient, type CapturedLead } from "../../src/core/leads.js";

// Mirrors migrations/0002_leads.sql. Duplicated here (rather than read from
// disk) because the Workers test runtime doesn't have Node fs access to the
// migrations directory — see test/integration/tenant-store.test.ts for the
// same pattern and its rationale.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, channel TEXT NOT NULL,
    conversation_key TEXT NOT NULL, name TEXT NOT NULL, email TEXT, phone TEXT,
    budget TEXT, project_description TEXT NOT NULL, asana_task_gid TEXT, created_at INTEGER NOT NULL
  );
`;

beforeAll(async () => {
  await env.DB.prepare(SCHEMA).run();
});

const lead: CapturedLead = {
  name: "Maria",
  email: "maria@example.com",
  budget: "$5k-10k",
  projectDescription: "Needs a marketing site.",
};

const ctx = { tenantId: "tenant-1", channel: "web" as const, conversationKey: "tenant-1:web:abc" };

describe("D1LeadSink", () => {
  it("persists a captured lead to D1", async () => {
    const sink = new D1LeadSink(env.DB, new NoopAsanaClient());
    await sink.capture(lead, ctx);

    const row = await env.DB.prepare("SELECT * FROM leads WHERE tenant_id = ? AND name = ?")
      .bind(ctx.tenantId, lead.name)
      .first();
    expect(row).toMatchObject({
      tenant_id: "tenant-1",
      channel: "web",
      conversation_key: "tenant-1:web:abc",
      name: "Maria",
      email: "maria@example.com",
      phone: null,
      budget: "$5k-10k",
      project_description: "Needs a marketing site.",
      asana_task_gid: null,
    });
  });

  it("records the Asana task gid when the Asana client succeeds", async () => {
    const asana: AsanaClient = { createTask: vi.fn(async () => ({ gid: "999" })) };
    const sink = new D1LeadSink(env.DB, asana);
    await sink.capture(lead, ctx);

    expect(asana.createTask).toHaveBeenCalledWith(lead, ctx);
    const row = await env.DB.prepare(
      "SELECT asana_task_gid FROM leads WHERE tenant_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(ctx.tenantId, lead.name)
      .first();
    expect(row).toMatchObject({ asana_task_gid: "999" });
  });

  it("still persists the lead when the Asana client throws", async () => {
    const asana: AsanaClient = {
      createTask: vi.fn(async () => {
        throw new Error("Asana unreachable");
      }),
    };
    const sink = new D1LeadSink(env.DB, asana);
    await expect(sink.capture(lead, ctx)).resolves.toBeUndefined();

    const count = await env.DB.prepare("SELECT COUNT(*) as n FROM leads WHERE tenant_id = ?")
      .bind(ctx.tenantId)
      .first<{ n: number }>();
    expect(count?.n).toBeGreaterThan(0);
  });
});
