"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { verifyLogin } from "@/server/services/admin";
import { clientIp } from "@/server/services/infra";
import { createSession, destroySession } from "@/server/auth/session";
import { ServiceError, type ActionResult } from "@/server/services/common";

export async function login(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const username = String(fd.get("username") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!username || !password) return { ok: false, message: "نام کاربری و رمز عبور را وارد کنید." };
  const db = await getDb();
  try {
    const ipKey = createHash("sha256").update(await clientIp()).digest("hex").slice(0, 32);
    const user = await verifyLogin(db, username, password, ipKey);
    await createSession(db, user.id, (await headers()).get("user-agent"));
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, message: e.message };
    console.error("[login]", e);
    return { ok: false, message: "ورود انجام نشد. دوباره تلاش کنید." };
  }
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}
