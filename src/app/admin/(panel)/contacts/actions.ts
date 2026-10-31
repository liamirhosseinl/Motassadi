"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import { saveContact } from "@/server/services/crm";

export async function createContactAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = 0;
  const r = await staffAction(["contacts.manage"], async ({ db, user }) => { id = (await saveContact(db, user, formObject(fd))).id; });
  if (!r.ok) return r;
  redirect(`/admin/contacts/${id}`);
}

export async function updateContactAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return staffAction(["contacts.manage"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    await saveContact(db, user, formObject(fd), id);
    revalidatePath(`/admin/contacts/${id}`);
    revalidatePath("/admin/contacts");
    return { ok: true, message: "ذخیره شد." };
  });
}
