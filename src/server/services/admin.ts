import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB, DBorTx } from "../db";
import * as s from "../db/schema";
import { assertCan, parseOrThrow, ServiceError, type Actor, zBool, zEnum, zOptText, zText } from "./common";
import { audit, rateLimit } from "./infra";
import { hashPassword, passwordProblem, verifyPassword, DUMMY_HASH } from "../auth/password";
import { ALL_PERMISSIONS, OWNER_LOCKED, type Permission, type Role } from "../auth/permissions";
import { OPEN_INQUIRY_STATUSES } from "./crm";

/* ════════ Authentication ════════ */

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

/** Verifies credentials with per-user lockout and per-IP rate limiting. Returns the user or a generic error. */
export async function verifyLogin(db: DB, username: string, password: string, ipKey: string) {
  const generic = new ServiceError("نام کاربری یا رمز عبور درست نیست.");
  if (!(await rateLimit(db, `login-ip:${ipKey}`, 20, 15 * 60))) throw new ServiceError("تلاش‌های ورود زیاد بوده است. ۱۵ دقیقه بعد دوباره تلاش کنید.");
  const uname = username.trim().toLowerCase().slice(0, 60);
  const [user] = await db.select().from(s.users).where(sql`lower(${s.users.username}) = ${uname}`);
  if (!user) { await verifyPassword(password, DUMMY_HASH); throw generic; }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new ServiceError("این حساب به‌دلیل تلاش‌های ناموفق موقتاً قفل شده است.");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    const failed = user.failedLogins + 1;
    await db.update(s.users).set({
      failedLogins: failed >= LOCK_AFTER ? 0 : failed,
      lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
    }).where(eq(s.users.id, user.id));
    await audit(db, user.id, "auth.failed", "user", user.id);
    throw generic;
  }
  await db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  await audit(db, user.id, "auth.login", "user", user.id);
  return user;
}

/* ════════ Users ════════ */

export const userInput = z.object({
  name: zText(80),
  username: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.string().regex(/^[a-z0-9_.-]{3,30}$/, "نام کاربری: ۳ تا ۳۰ حرف لاتین کوچک، عدد یا . _ -")),
  role: zEnum(["owner", "agent", "finance", "content"]),
  isActive: zBool,
});

export async function listUsers(db: DBorTx) {
  return db.select({ id: s.users.id, name: s.users.name, username: s.users.username, role: s.users.role, isActive: s.users.isActive, lastLoginAt: s.users.lastLoginAt })
    .from(s.users).orderBy(asc(s.users.name));
}

export async function staffOptions(db: DBorTx) {
  return db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.isActive, true)).orderBy(asc(s.users.name));
}

async function ownersLeft(db: DBorTx, excludingId: number) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users)
    .where(and(eq(s.users.role, "owner"), eq(s.users.isActive, true), sql`${s.users.id} <> ${excludingId}`));
  return n;
}

export async function createUser(db: DB, actor: Actor, raw: unknown, password: string) {
  assertCan(actor, "users.manage");
  const d = parseOrThrow(userInput, raw);
  const problem = passwordProblem(password);
  if (problem) throw new ServiceError(problem, { password: problem });
  const [exists] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${d.username}`);
  if (exists) throw new ServiceError("این نام کاربری قبلاً استفاده شده است.", { username: "تکراری" });
  const [u] = await db.insert(s.users).values({ ...d, passwordHash: await hashPassword(password) }).returning({ id: s.users.id });
  await audit(db, actor.id, "user.create", "user", u.id, { username: d.username, role: d.role });
  return u;
}

export async function updateUser(db: DB, actor: Actor, id: number, raw: unknown) {
  assertCan(actor, "users.manage");
  const d = parseOrThrow(userInput.omit({ username: true }), raw);
  const [cur] = await db.select().from(s.users).where(eq(s.users.id, id));
  if (!cur) throw new ServiceError("کاربر پیدا نشد.");
  if (cur.role === "owner" && (d.role !== "owner" || !d.isActive) && (await ownersLeft(db, id)) === 0) {
    throw new ServiceError("دست‌کم یک مدیر فعال باید باقی بماند.");
  }
  await db.update(s.users).set({ ...d, updatedAt: new Date() }).where(eq(s.users.id, id));
  if (!d.isActive || d.role !== cur.role) await db.delete(s.sessions).where(eq(s.sessions.userId, id));
  await audit(db, actor.id, "user.update", "user", id, { role: d.role, isActive: d.isActive });
}

export async function setUserPassword(db: DB, actor: Actor, id: number, password: string) {
  if (id !== actor.id) assertCan(actor, "users.manage");
  const problem = passwordProblem(password);
  if (problem) throw new ServiceError(problem, { password: problem });
  await db.update(s.users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(Date.now() - 1000), failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, id));
  await db.delete(s.sessions).where(eq(s.sessions.userId, id));
  await audit(db, actor.id, "user.password", "user", id);
}

export async function changeOwnPassword(db: DB, actor: Actor, current: string, next: string) {
  const [u] = await db.select().from(s.users).where(eq(s.users.id, actor.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new ServiceError("رمز فعلی درست نیست.", { current: "رمز فعلی درست نیست." });
  await setUserPassword(db, actor, actor.id, next);
}

export async function rolePermissionMatrix(db: DBorTx) {
  const rows = await db.select().from(s.rolePermissions);
  const m: Record<string, Set<string>> = {};
  for (const r of rows) (m[r.role] ??= new Set()).add(r.permission);
  return m;
}

export async function setRolePermissions(db: DB, actor: Actor, role: Role, perms: string[]) {
  assertCan(actor, "users.manage");
  const valid = perms.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
  if (role === "owner") for (const p of OWNER_LOCKED) if (!valid.includes(p)) valid.push(p);
  await db.transaction(async (tx) => {
    await tx.delete(s.rolePermissions).where(eq(s.rolePermissions.role, role));
    if (valid.length) await tx.insert(s.rolePermissions).values(valid.map((permission) => ({ role, permission })));
    await audit(tx, actor.id, "role.permissions", "role", role, { permissions: valid });
  });
}

/* ════════ Content pages ════════ */

export async function getPage(db: DBorTx, slug: string) {
  const [p] = await db.select().from(s.contentPages).where(eq(s.contentPages.slug, slug));
  return p ?? null;
}
export async function listPages(db: DBorTx) {
  return db.select().from(s.contentPages).orderBy(asc(s.contentPages.slug));
}
export const pageInput = z.object({ title: zText(120), body: zText(20000), seoTitle: zOptText(120), seoDescription: zOptText(300), needsReview: zBool });
export async function updatePage(db: DB, actor: Actor, slug: string, raw: unknown) {
  assertCan(actor, "content.manage");
  const d = parseOrThrow(pageInput, raw);
  const [row] = await db.update(s.contentPages).set({ ...d, updatedAt: new Date(), updatedBy: actor.id }).where(eq(s.contentPages.slug, slug)).returning();
  if (!row) throw new ServiceError("صفحه پیدا نشد.");
  await audit(db, actor.id, "page.update", "page", slug);
}

/* ════════ Taxonomies ════════ */

export async function saveTaxonomy(db: DB, actor: Actor, kind: "category" | "feature" | "finance", raw: Record<string, unknown>) {
  assertCan(actor, "settings.manage");
  const id = raw.id ? Number(raw.id) : null;
  const name = parseOrThrow(zText(60), raw.name);
  const isActive = raw.isActive === undefined ? true : raw.isActive === "on" || raw.isActive === "true";
  if (kind === "category") {
    const hasRooms = raw.hasRooms === "on";
    if (id) await db.update(s.propertyCategories).set({ name, hasRooms, isActive }).where(eq(s.propertyCategories.id, id));
    else {
      const slug = parseOrThrow(z.string().regex(/^[a-z0-9-]{2,30}$/, "شناسهٔ لاتین (مثلاً office) لازم است."), raw.slug);
      await db.insert(s.propertyCategories).values({ name, slug, hasRooms, sort: 100 });
    }
  } else if (kind === "feature") {
    if (id) await db.update(s.propertyFeatures).set({ name, isActive }).where(eq(s.propertyFeatures.id, id));
    else await db.insert(s.propertyFeatures).values({ name, sort: 100 }).onConflictDoNothing();
  } else {
    const fkind = parseOrThrow(zEnum(["income", "expense"]), raw.kind);
    const isCommission = raw.isCommission === "on";
    if (id) await db.update(s.financeCategories).set({ name, isActive, isCommission }).where(eq(s.financeCategories.id, id));
    else await db.insert(s.financeCategories).values({ kind: fkind, name, isCommission, sort: 100 }).onConflictDoNothing();
  }
  await audit(db, actor.id, "taxonomy.save", kind, id, { name });
}

export async function taxonomies(db: DBorTx) {
  const [categories, features, finance] = await Promise.all([
    db.select().from(s.propertyCategories).orderBy(asc(s.propertyCategories.sort)),
    db.select().from(s.propertyFeatures).orderBy(asc(s.propertyFeatures.sort)),
    db.select().from(s.financeCategories).orderBy(asc(s.financeCategories.kind), asc(s.financeCategories.sort)),
  ]);
  return { categories, features, finance };
}

/* ════════ Dashboard ════════ */

export async function dashboardStats(db: DBorTx, actor: Actor) {
  assertCan(actor, "dashboard.view");
  const byStatus = await db.select({ status: s.properties.status, n: sql<number>`count(*)::int` }).from(s.properties).groupBy(s.properties.status);
  const count = (st: string) => byStatus.find((r) => r.status === st)?.n ?? 0;
  const total = byStatus.filter((r) => r.status !== "archived").reduce((a, r) => a + r.n, 0);
  const [inq] = await db.select({
    open: sql<number>`count(*) filter (where ${s.inquiries.status} in ${OPEN_INQUIRY_STATUSES})::int`,
    fresh: sql<number>`count(*) filter (where ${s.inquiries.status} = 'new')::int`,
    last30: sql<number>`count(*) filter (where ${s.inquiries.createdAt} > now() - interval '30 days')::int`,
  }).from(s.inquiries);
  const recentProps = await db.select({ id: s.properties.id, ref: s.properties.ref, title: s.properties.title, status: s.properties.status, updatedAt: s.properties.updatedAt })
    .from(s.properties).orderBy(desc(s.properties.updatedAt)).limit(6);
  const recentInquiries = actor.permissions.has("inquiries.view")
    ? await db.select({ id: s.inquiries.id, name: s.inquiries.name, status: s.inquiries.status, createdAt: s.inquiries.createdAt }).from(s.inquiries).orderBy(desc(s.inquiries.createdAt)).limit(6)
    : [];
  return {
    properties: { total, published: count("published"), draft: count("draft"), pending: count("pending_review"), reserved: count("reserved"), sold: count("sold"), rented: count("rented") },
    inquiries: inq, recentProps, recentInquiries,
  };
}

export async function auditList(db: DBorTx, actor: Actor, page: number) {
  assertCan(actor, "audit.view");
  const rows = await db.select({ a: s.auditLogs, by: s.users.name }).from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
    .orderBy(desc(s.auditLogs.createdAt)).limit(50).offset((page - 1) * 50);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.auditLogs);
  return { rows, total };
}

export { inArray };
