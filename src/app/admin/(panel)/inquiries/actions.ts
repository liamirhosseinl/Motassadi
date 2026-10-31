"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import {
  addInquiryNote, assignInquiry, createContactFromInquiry, createFollowup, createStaffInquiry, linkInquiryContact, linkInquiryTransaction, setInquiryStatus,
} from "@/server/services/crm";
import { parseJalaliDateTime } from "@/lib/format";

const done = (id: number, message: string): ActionResult => { revalidatePath(`/admin/inquiries/${id}`); revalidatePath("/admin/inquiries"); return { ok: true, message }; };

export async function inquiryStatusAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["inquiries.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    await setInquiryStatus(db, user, id, String(fd.get("status")), String(fd.get("note") ?? "") || null);
    return done(id, "وضعیت ثبت شد.");
  });
}

export async function inquiryAssignAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["inquiries.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    const agent = Number(fd.get("agentId")) || null;
    await assignInquiry(db, user, id, agent);
    return done(id, "مسئول تعیین شد.");
  });
}

export async function inquiryNoteAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["inquiries.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    await addInquiryNote(db, user, id, fd.get("kind") === "call" ? "call" : "note", String(fd.get("body") ?? ""));
    return done(id, "ثبت شد.");
  });
}

export async function inquiryLinkContactAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["inquiries.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    if (fd.get("mode") === "create") await createContactFromInquiry(db, user, id);
    else await linkInquiryContact(db, user, id, Number(fd.get("contactId")));
    return done(id, "مخاطب متصل شد.");
  });
}

export async function inquiryLinkTxAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["inquiries.manage", "transactions.view"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    await linkInquiryTransaction(db, user, id, Number(fd.get("transactionId")));
    return done(id, "به معامله متصل شد.");
  });
}

export async function inquiryFollowupAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["followups.manage"], async ({ db, user }) => {
    const id = Number(fd.get("inquiryId"));
    const due = parseJalaliDateTime(String(fd.get("date") ?? ""), String(fd.get("time") ?? ""));
    if (!due) return { ok: false, message: "تاریخ و ساعت را درست وارد کنید.", fieldErrors: { date: "مثلاً ۱۴۰۵/۰۸/۱۲" } };
    await createFollowup(db, user, { ...formObject(fd), dueAt: due });
    revalidatePath("/admin/followups");
    return done(id, "پیگیری ثبت شد.");
  });
}

export async function staffInquiryAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = 0;
  const r = await staffAction(["inquiries.manage"], async ({ db, user }) => { id = (await createStaffInquiry(db, user, formObject(fd))).id; });
  if (!r.ok) return r;
  redirect(`/admin/inquiries/${id}`);
}
