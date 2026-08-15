import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env.js";

const HOUSEKEEPING_INTERVAL_MS = 24 * 60 * 60 * 1000;

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Layer 3 of the rate-limit stack (docs/ARCHITECTURE.md §Rate limiting): a
 * global-per-tenant circuit breaker on Claude spend. Bounds the aggregate
 * cost even if many distinct senders each individually stay under their own
 * ConversationDO quota. One instance per tenant, addressed via
 * `env.BUDGET.idFromName(tenantId)`.
 */
export class BudgetDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
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
    return this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)
      .toArray()[0]?.value;
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  /** Call BEFORE the Claude call. Returns false (and does not increment) once the daily cap is reached. */
  tryConsume(dailyCap: number): { allowed: boolean } {
    const now = Date.now();
    const today = utcDay(now);
    const day = this.getMeta("day");
    let count = day === today ? Number(this.getMeta("count") ?? "0") : 0;
    if (count >= dailyCap) {
      return { allowed: false };
    }
    count += 1;
    this.setMeta("day", today);
    this.setMeta("count", String(count));
    return { allowed: true };
  }

  /** Call if the Claude call failed after tryConsume — refunds the slot so infra failures don't eat budget. */
  refund(): void {
    const today = utcDay(Date.now());
    if (this.getMeta("day") !== today) return;
    const current = Number(this.getMeta("count") ?? "0");
    this.setMeta("count", String(Math.max(0, current - 1)));
  }

  async alarm(): Promise<void> {
    // Nothing to prune (two meta rows), just keep the alarm cycle alive so the
    // object doesn't sit alarm-less indefinitely if Cloudflare ever needs that.
    await this.ctx.storage.setAlarm(Date.now() + HOUSEKEEPING_INTERVAL_MS);
  }
}
