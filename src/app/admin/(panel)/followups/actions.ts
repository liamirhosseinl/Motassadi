"use server";

import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import { completeFollowup, createFollowup } from "@/server/services/crm";
import { parseJalaliDateTime } from "@/lib/format";

export async function createFollowupAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["followups.manage"], async ({ db, user }) => {
    const due = parseJalaliDateTime(String(fd.get("date") ?? ""), String(fd.get("time") ?? ""));
    if (!due) return { ok: false, message: "تاریخ و ساعت را درست وارد کنید.", fieldErrors: { date: "قالب: ۱۴۰۵/۰۸/۱۲" } };
    await createFollowup(db, user, { ...formObject(fd), dueAt: due });
    revalidatePath("/admin/followups");
    revalidatePath("/admin");
    return { ok: true, message: "پیگیری ثبت شد." };
  });
}

export async function toggleFollowupAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["followups.manage"], async ({ db, user }) => {
    await completeFollowup(db, user, Number(fd.get("id")), fd.get("done") === "1");
    revalidatePath("/admin/followups");
    revalidatePath("/admin");
    return { ok: true, message: fd.get("done") === "1" ? "انجام شد." : "دوباره باز شد." };
  });
}
