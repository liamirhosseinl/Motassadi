"use server";

import { redirect } from "next/navigation";
import { staffAction } from "@/server/action";
import type { ActionResult } from "@/server/services/common";
import { changeOwnPassword } from "@/server/services/admin";

export async function changePasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("next2") ?? "")) return { ok: false, message: "تکرار رمز یکسان نیست.", fieldErrors: { next2: "یکسان نیست" } };
  const r = await staffAction([], async ({ db, user }) => { await changeOwnPassword(db, user, String(fd.get("current") ?? ""), next); });
  if (!r.ok) return r;
  // All sessions (including this one) were revoked; sign in again with the new password.
  redirect("/admin/login?changed=1");
}
