import { z } from "zod";
import type { ChannelId } from "@sitebot/shared";
import { log } from "../lib/log.js";

/** Validated `capture_lead` tool input — see generate.ts's LEAD_CAPTURE_TOOL. */
export interface CapturedLead {
  name: string;
  projectDescription: string;
  email?: string;
  phone?: string;
  budget?: string;
}

export interface LeadContext {
  tenantId: string;
  channel: ChannelId;
  /** The ConversationDO's name — lets `/admin/conversations/:conversationId` (admin.ts) find the full transcript behind a lead. */
  conversationKey: string;
}

/**
 * Dependency-injected for the same reason as Retriever/Generator
 * (core/retrieval.ts, core/generate.ts): tests must never touch a real D1
 * binding or the Asana API from core/pipeline.test.ts.
 */
export interface LeadSink {
  capture(lead: CapturedLead, ctx: LeadContext): Promise<void>;
}

export interface AsanaTask {
  gid: string;
}

/** Separately injected from LeadSink so D1 persistence (which must never fail the turn) doesn't depend on Asana being configured or reachable. */
export interface AsanaClient {
  createTask(lead: CapturedLead, ctx: LeadContext): Promise<AsanaTask | null>;
}

const capturedLeadSchema = z
  .object({
    name: z.string().trim().min(1),
    projectDescription: z.string().trim().min(1),
    email: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    budget: z.string().trim().min(1).optional(),
  })
  .refine((lead) => Boolean(lead.email || lead.phone), {
    message: "at least one of email or phone is required",
  });

/**
 * Validates a `capture_lead` tool call's raw (model-generated) input. Never
 * throws — a malformed or under-specified tool call should be dropped
 * silently rather than fail the whole turn; see generate.ts.
 */
export function parseCapturedLead(rawInput: unknown): CapturedLead | null {
  const parsed = capturedLeadSchema.safeParse(rawInput);
  return parsed.success ? parsed.data : null;
}

/** Used when ASANA_ACCESS_TOKEN/ASANA_PROJECT_GID aren't configured — see core/deps.ts. Leads still land in D1. */
export class NoopAsanaClient implements AsanaClient {
  async createTask(): Promise<null> {
    return null;
  }
}

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

export class AsanaHttpClient implements AsanaClient {
  constructor(
    private readonly accessToken: string,
    private readonly projectGid: string,
  ) {}

  async createTask(lead: CapturedLead, ctx: LeadContext): Promise<AsanaTask> {
    const notes = [
      `Contact: ${[lead.email, lead.phone].filter(Boolean).join(" / ")}`,
      lead.budget ? `Budget: ${lead.budget}` : null,
      `Channel: ${ctx.channel}`,
      "",
      lead.projectDescription,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    const response = await fetch(`${ASANA_API_BASE}/tasks`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: { name: `Lead: ${lead.name}`, notes, projects: [this.projectGid] },
      }),
    });
    if (!response.ok) {
      throw new Error(`Asana task creation failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { data: { gid: string } };
    return { gid: body.data.gid };
  }
}

/**
 * D1 is the durable store (source of truth, survives an Asana outage or a
 * misconfigured project); the Asana push is a best-effort side effect on
 * top — same cheapest/most-durable-first layering as the rate limiter (see
 * docs/ARCHITECTURE.md §Rate limiting).
 */
export class D1LeadSink implements LeadSink {
  constructor(
    private readonly db: D1Database,
    private readonly asana: AsanaClient,
  ) {}

  async capture(lead: CapturedLead, ctx: LeadContext): Promise<void> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO leads
           (id, tenant_id, channel, conversation_key, name, email, phone, budget, project_description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        ctx.tenantId,
        ctx.channel,
        ctx.conversationKey,
        lead.name,
        lead.email ?? null,
        lead.phone ?? null,
        lead.budget ?? null,
        lead.projectDescription,
        Date.now(),
      )
      .run();

    try {
      const task = await this.asana.createTask(lead, ctx);
      if (task) {
        await this.db.prepare(`UPDATE leads SET asana_task_gid = ? WHERE id = ?`).bind(task.gid, id).run();
      }
    } catch (err) {
      log.warn("asana_task_creation_failed", { tenant: ctx.tenantId, error: String(err) });
    }
  }
}
