import { DurableObject } from "cloudflare:workers";
import type { ChatTurn, SupportedLocale, TurnStatus } from "@sitebot/shared";
import type { Env } from "../env.js";

const SEEN_EVENT_TTL_MS = 48 * 60 * 60 * 1000; // Meta/Telegram redelivery windows are well under this
const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_DELETE_ALL_MS = 90 * 24 * 60 * 60 * 1000;
const HOUSEKEEPING_INTERVAL_MS = 24 * 60 * 60 * 1000;

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * One instance per (tenant, channel, sender) — addressed by the caller via
 * `env.CONVERSATION.idFromName(\`${tenantId}:${channel}:${senderHash}\`)`.
 * Owns three things atomically because they're written together on every
 * turn: message history, redelivery dedup, and the per-sender daily quota.
 *
 * Why a Durable Object instead of D1 for this: see docs/ARCHITECTURE.md
 * §"DO vs D1". Short version — a DO serializes all calls to one conversation,
 * so two near-simultaneous webhook deliveries cannot race on read-modify-write
 * history, and dedup + quota + append happen as one atomic step for free.
 *
 * Methods are called as RPC on the stub (`env.CONVERSATION.get(id).beginTurn(...)`),
 * not via `fetch` — see https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
 */
export class ConversationDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
          content    TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS seen_events (
          event_id   TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null) {
        await this.ctx.storage.setAlarm(Date.now() + HOUSEKEEPING_INTERVAL_MS);
      }
    });
  }

  private getMeta(key: string): string | undefined {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)
      .toArray()[0];
    return row?.value;
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  /**
   * The single serialized entry point for an inbound turn: dedup -> quota ->
   * append -> return the trimmed history ready to send to Claude (ending
   * with the message just appended).
   */
  beginTurn(
    eventId: string,
    text: string,
    opts: { maxPerDay: number; historyWindow: number; langHint?: SupportedLocale },
  ): TurnStatus {
    const now = Date.now();

    const alreadySeen = this.ctx.storage.sql
      .exec<{ found: number }>("SELECT 1 AS found FROM seen_events WHERE event_id = ?", eventId)
      .toArray()[0];
    if (alreadySeen) {
      return { status: "duplicate" };
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO seen_events (event_id, created_at) VALUES (?, ?)",
      eventId,
      now,
    );

    const today = utcDay(now);
    const quotaDay = this.getMeta("quota_day");
    let quotaCount = quotaDay === today ? Number(this.getMeta("quota_count") ?? "0") : 0;
    if (quotaCount >= opts.maxPerDay) {
      return { status: "rate_limited", retryAfterSec: secondsUntilNextUtcDay(now) };
    }
    quotaCount += 1;
    this.setMeta("quota_day", today);
    this.setMeta("quota_count", String(quotaCount));

    this.ctx.storage.sql.exec(
      "INSERT INTO messages (role, content, created_at) VALUES ('user', ?, ?)",
      text,
      now,
    );
    this.setMeta("last_seen_at", String(now));

    const lang = this.resolveLang(opts.langHint);

    return { status: "ok", history: this.readHistory(opts.historyWindow), lang };
  }

  /** Appends the assistant's reply and persists the language actually used, once generation succeeds. */
  completeTurn(assistantText: string, lang: SupportedLocale): void {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (role, content, created_at) VALUES ('assistant', ?, ?)",
      assistantText,
      now,
    );
    this.setMeta("lang", lang);
    this.setMeta("last_seen_at", String(now));
  }

  /** Called when generation failed for a reason that isn't the user's fault — refunds the quota slot. */
  failTurn(): void {
    const today = utcDay(Date.now());
    const quotaDay = this.getMeta("quota_day");
    if (quotaDay !== today) return;
    const current = Number(this.getMeta("quota_count") ?? "0");
    this.setMeta("quota_count", String(Math.max(0, current - 1)));
  }

  getHistory(historyWindow: number): ChatTurn[] {
    return this.readHistory(historyWindow);
  }

  private readHistory(historyWindow: number): ChatTurn[] {
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT role, content, created_at FROM messages ORDER BY id DESC LIMIT ?",
        historyWindow,
      )
      .toArray() as { role: "user" | "assistant"; content: string; created_at: number }[];
    return rows
      .reverse()
      .map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at }));
  }

  /** §Language policy in docs/ARCHITECTURE.md: hint > persisted preference > default (never guessed here). */
  private resolveLang(hint: SupportedLocale | undefined): SupportedLocale {
    if (hint) return hint;
    const persisted = this.getMeta("lang");
    return (persisted as SupportedLocale | undefined) ?? "en";
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "DELETE FROM seen_events WHERE created_at < ?",
      now - SEEN_EVENT_TTL_MS,
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM messages WHERE created_at < ?",
      now - MESSAGE_RETENTION_MS,
    );

    const lastSeenAt = Number(this.getMeta("last_seen_at") ?? "0");
    if (lastSeenAt > 0 && now - lastSeenAt > IDLE_DELETE_ALL_MS) {
      await this.ctx.storage.deleteAll();
      return; // nothing to reschedule — object is empty until the next real message
    }

    await this.ctx.storage.setAlarm(now + HOUSEKEEPING_INTERVAL_MS);
  }
}

function secondsUntilNextUtcDay(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.round((next.getTime() - now) / 1000));
}
