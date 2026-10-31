import "server-only";
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DBorTx = DB | Tx;

type Holder = { db?: Promise<DB>; close?: () => Promise<void> };
const g = globalThis as unknown as { __motasadiDb?: Holder };
const holder: Holder = (g.__motasadiDb ??= {});

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL
 *   postgres://user:pass@host:5432/db  → PostgreSQL (production)
 *   pglite://./.data/db                → embedded PGlite (local development, single process)
 *   pglite://memory                    → in-memory PGlite (tests)
 */
async function connect(url: string): Promise<{ db: DB; close: () => Promise<void> }> {
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const target = url.slice("pglite://".length);
    let client;
    if (target === "memory") {
      client = new PGlite();
    } else {
      const dir = path.resolve(process.cwd(), target);
      fs.mkdirSync(dir, { recursive: true });
      client = new PGlite(dir);
    }
    const db = drizzle(client, { schema });
    // Embedded database: keep it migrated automatically so a local install "just works".
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const { bootstrap } = await import("./bootstrap");
    await bootstrap(db as unknown as DB);
    return { db: db as unknown as DB, close: () => client.close() };
  }
  const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
  const db = drizzlePg(pool, { schema });
  return { db, close: () => pool.end() };
}

export function getDb(): Promise<DB> {
  if (!holder.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    holder.db = connect(url).then(({ db, close }) => {
      holder.close = close;
      return db;
    }).catch((e) => {
      holder.db = undefined;
      throw e;
    });
  }
  return holder.db;
}

/** Test helper: replace the global connection. */
export async function resetDbForTests(url: string) {
  if (holder.close) await holder.close();
  holder.db = undefined;
  holder.close = undefined;
  process.env.DATABASE_URL = url;
  return getDb();
}

export { schema };
