import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import type { DBorTx } from "../db";
import * as s from "../db/schema";
import { currentJalaliYear } from "@/lib/format";

/* ───── Rate limiting (database-backed, works across processes) ───── */

export async function rateLimit(db: DBorTx, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const res = await db.execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`);
  const rows = (res as unknown as { rows: { count: number }[] }).rows;
  return Number(rows[0]?.count ?? 0) <= limit;
}

/** Client IP as reported by the reverse proxy. Only trustworthy behind a proxy that sets these headers. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/* ───── Sequential references ───── */

export async function nextCounter(db: DBorTx, name: string): Promise<number> {
  const res = await db.execute(sql`
    insert into counters (name, value) values (${name}, 1)
    on conflict (name) do update set value = counters.value + 1
    returning value`);
  return Number((res as unknown as { rows: { value: number }[] }).rows[0].value);
}

export async function nextReference(db: DBorTx, prefix: string, kind: "property" | "transaction"): Promise<string> {
  const jy = currentJalaliYear();
  const n = await nextCounter(db, `${kind}-${jy}`);
  return `${prefix}-${jy}-${String(n).padStart(4, "0")}`;
}

/* ───── Audit log ───── */

export async function audit(
  db: DBorTx, userId: number | null, action: string, entity: string, entityId: string | number | null, details?: Record<string, unknown>,
) {
  await db.insert(s.auditLogs).values({ userId, action, entity, entityId: entityId === null ? null : String(entityId), details: details ?? null });
}
