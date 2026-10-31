import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, type DBorTx } from "../db";
import * as s from "../db/schema";
import type { Permission, Role } from "./permissions";

export const SESSION_COOKIE = "mt_session";
const ttlHours = () => Number(process.env.SESSION_TTL_HOURS ?? 12);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type CurrentUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
  permissions: Set<Permission>;
};

export async function createSession(db: DBorTx, userId: number, userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours() * 3600_000);
  await db.insert(s.sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure by default in production; set COOKIE_SECURE=false only for a plain-HTTP local test.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(s.sessions).where(eq(s.sessions.id, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function loadPermissions(db: DBorTx, role: string): Promise<Set<Permission>> {
  const rows = await db.select({ p: s.rolePermissions.permission }).from(s.rolePermissions).where(eq(s.rolePermissions.role, role));
  return new Set(rows.map((r) => r.p as Permission));
}

/** Resolves the signed-in user from the session cookie (once per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const id = hashToken(token);
  const [row] = await db
    .select({ session: s.sessions, user: s.users })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, id), gt(s.sessions.expiresAt, new Date())));
  if (!row || !row.user.isActive) return null;
  // Sessions created before the last password change are invalid.
  if (row.session.createdAt < row.user.passwordChangedAt) return null;
  // Sliding expiry, written at most every 10 minutes.
  if (Date.now() - row.session.lastSeenAt.getTime() > 10 * 60_000) {
    await db.update(s.sessions)
      .set({ lastSeenAt: new Date(), expiresAt: sql`greatest(${s.sessions.expiresAt}, now() + make_interval(hours => ${ttlHours()}))` })
      .where(eq(s.sessions.id, id));
  }
  return {
    id: row.user.id,
    name: row.user.name,
    username: row.user.username,
    role: row.user.role as Role,
    permissions: await loadPermissions(db, row.user.role),
  };
});

export class ForbiddenError extends Error {
  constructor(public permission?: string) { super("FORBIDDEN"); }
}

export function can(user: CurrentUser | null, p: Permission) {
  return !!user && user.permissions.has(p);
}

/** Page guard: redirects anonymous users to login; renders 403 for missing permission. */
export async function requirePage(p?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (p && !user.permissions.has(p)) redirect("/admin/forbidden");
  return user;
}

/** Action guard: throws for anonymous or unauthorized callers. Use at the top of every server action. */
export async function authorize(...required: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("auth");
  for (const p of required) if (!user.permissions.has(p)) throw new ForbiddenError(p);
  return user;
}
