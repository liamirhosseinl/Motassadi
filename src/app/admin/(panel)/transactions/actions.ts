"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import { changeTransactionStatus, createTransaction, updateTransaction, TX_STATUSES, type TxStatus } from "@/server/services/deals";

/** Drop party rows whose contact select was left empty so the two arrays stay aligned. */
function txForm(fd: FormData) {
  const o = formObject(fd);
  const contacts = (o.partyContact as string[] | undefined) ?? [];
  const roles = (o.partyRole as string[] | undefined) ?? [];
  const keep = contacts.map((c, i) => [c, roles[i] ?? ""] as const).filter(([c]) => c !== "");
  o.partyContact = keep.map(([c]) => c);
  o.partyRole = keep.map(([, r]) => r);
  return o;
}

export async function createTxAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = 0;
  const r = await staffAction(["transactions.manage"], async ({ db, user }) => { id = (await createTransaction(db, user, txForm(fd))).id; });
  if (!r.ok) return r;
  redirect(`/admin/transactions/${id}`);
}

export async function updateTxAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["transactions.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    await updateTransaction(db, user, id, txForm(fd), Number(fd.get("version")));
    revalidatePath(`/admin/transactions/${id}`);
    revalidatePath("/admin/transactions");
    return { ok: true, message: "ذخیره شد. کمیسیون مورد انتظار دوباره محاسبه شد." };
  });
}

export async function txStatusAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["transactions.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    const to = String(fd.get("to") ?? "");
    if (!(to in TX_STATUSES)) return { ok: false, message: "وضعیت جدید را انتخاب کنید.", fieldErrors: { to: "انتخاب کنید" } };
    const res = await changeTransactionStatus(db, user, id, to as TxStatus, {
      reason: String(fd.get("reason") ?? "") || null,
      updateProperty: fd.get("updateProperty") === "on",
    });
    revalidatePath(`/admin/transactions/${id}`);
    revalidatePath("/admin/transactions");
    if (res.transaction.propertyId) { revalidatePath("/"); revalidatePath("/properties"); }
    return { ok: true, message: ["وضعیت معامله ثبت شد.", res.propertyMessage].filter(Boolean).join(" ") };
  });
}
