import { eq, sql } from "drizzle-orm";
import { bootstrap } from "@/server/db/bootstrap";
import sharp from "sharp";
import { resetDbForTests, type DB } from "@/server/db";
import * as s from "@/server/db/schema";
import { setStorageForTests, type Storage } from "@/server/services/storage";
import type { Actor } from "@/server/services/common";
import type { Permission, Role } from "@/server/auth/permissions";
import { hashPassword } from "@/server/auth/password";

export class MemoryStorage implements Storage {
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) { this.files.set(k, d); }
  async get(k: string) { return this.files.get(k) ?? null; }
  async remove(k: string) { this.files.delete(k); }
}

/**
 * Fresh database per test file.
 * TEST_DATABASE_URL may point at a real, already-migrated PostgreSQL database that is used ONLY for tests:
 * every table is truncated and reference data re-seeded before each file, so files cannot see each other's rows.
 */
export async function freshDb(): Promise<DB> {
  setStorageForTests(new MemoryStorage());
  const url = process.env.TEST_DATABASE_URL ?? "pglite://memory";
  const db = await resetDbForTests(url);
  if (!url.startsWith("pglite:")) {
    const res = await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`);
    const tables = (res.rows as { tablename: string }[]).map((r) => `"${r.tablename}"`);
    if (tables.length) await db.execute(sql.raw(`truncate ${tables.join(", ")} restart identity cascade`));
    await bootstrap(db);
  }
  return db;
}

let n = 0;
export async function makeActor(db: DB, role: Role): Promise<Actor> {
  n++;
  const [u] = await db.insert(s.users).values({ name: `${role} ${n}`, username: `${role}${n}${Date.now() % 10000}`, role, passwordHash: await hashPassword("test-password-123") }).returning();
  const perms = await db.select().from(s.rolePermissions).where(eq(s.rolePermissions.role, role));
  return { id: u.id, role, permissions: new Set(perms.map((p) => p.permission as Permission)) };
}

export async function categoryId(db: DB, slug: string) {
  const [c] = await db.select().from(s.propertyCategories).where(eq(s.propertyCategories.slug, slug));
  return c.id;
}

export async function financeCategory(db: DB, kind: "income" | "expense", commission: boolean) {
  const rows = await db.select().from(s.financeCategories).where(eq(s.financeCategories.kind, kind));
  return rows.find((r) => r.isCommission === commission)!.id;
}

export async function pngBuffer(w = 64, h = 48) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 26, g: 50, b: 99 } } }).png().toBuffer();
}

export function propertyForm(overrides: Record<string, unknown> = {}) {
  return {
    title: "آپارتمان ۹۵ متری نمونه", dealType: "sale", categoryId: "", description: "آپارتمان دو خوابه با نورگیر جنوبی و پارکینگ اختصاصی در طبقهٔ دوم.",
    price: "۴٬۸۵۰٬۰۰۰٬۰۰۰", area: "95", bedrooms: "2", floor: "2", totalFloors: "4", city: "زرند", neighborhood: "شهرک فرهنگیان",
    address: "نشانی خصوصی مالک — نباید عمومی شود", internalNotes: "یادداشت داخلی محرمانه", featureIds: [],
    ...overrides,
  };
}
