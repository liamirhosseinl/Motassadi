"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffAction } from "@/server/action";
import { formObject, ServiceError, type ActionResult } from "@/server/services/common";
import { createFinanceEntry, voidFinanceEntry } from "@/server/services/deals";
import { storage, storeAttachment } from "@/server/services/storage";

export async function createFinanceAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target = "/admin/finance?created=1";
  const r = await staffAction(["finance.manage"], async ({ db, user }) => {
    const file = fd.get("attachment");
    let att: Awaited<ReturnType<typeof storeAttachment>> & { originalName: string } | null = null;
    if (file instanceof File && file.size > 0) {
      const stored = await storeAttachment(Buffer.from(await file.arrayBuffer()));
      att = { ...stored, originalName: file.name.slice(0, 200) || "attachment" };
    }
    try {
      const res = await createFinanceEntry(db, user, formObject(fd), att);
      if (res.duplicate) target = "/admin/finance?duplicate=1";
      if (res.duplicate && att) await storage().remove(att.storageKey);
    } catch (e) {
      if (att) await storage().remove(att.storageKey).catch(() => undefined);
      throw e;
    }
    const tx = Number(fd.get("transactionId"));
    if (tx) { revalidatePath(`/admin/transactions/${tx}`); target = `/admin/transactions/${tx}`; }
    revalidatePath("/admin/finance");
    revalidatePath("/admin/transactions");
  });
  if (!r.ok) return r;
  redirect(target);
}

export async function voidFinanceAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await staffAction(["finance.void"], async ({ db, user }) => {
    const reason = String(fd.get("reason") ?? "");
    if (!reason.trim()) throw new ServiceError("دلیل ابطال را بنویسید.", { reason: "دلیل لازم است." });
    const row = await voidFinanceEntry(db, user, Number(fd.get("id")), reason);
    revalidatePath("/admin/finance");
    if (row.transactionId) revalidatePath(`/admin/transactions/${row.transactionId}`);
  });
  if (!r.ok) return r;
  // The voided row leaves the default (recorded) view, so confirm on the reloaded list, keeping the filters.
  const back = new URLSearchParams(String(fd.get("back") ?? ""));
  back.delete("created"); back.delete("duplicate"); back.set("voided", "1");
  redirect(`/admin/finance?${back.toString()}`);
}
