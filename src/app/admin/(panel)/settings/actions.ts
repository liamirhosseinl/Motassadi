"use server";

import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import { saveSettingsGroup } from "@/server/services/settings";
import { saveTaxonomy } from "@/server/services/admin";

export async function settingsAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["settings.manage"], async ({ db, user }) => {
    await saveSettingsGroup(db, user, String(fd.get("group")), formObject(fd));
    revalidatePath("/", "layout");
    return { ok: true, message: "ذخیره شد." };
  });
}

export async function taxonomyAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["settings.manage"], async ({ db, user }) => {
    const kind = String(fd.get("kind_")) as "category" | "feature" | "finance";
    if (!["category", "feature", "finance"].includes(kind)) return { ok: false, message: "نوع نامعتبر است." };
    const o = formObject(fd);
    if (fd.get("id") && !fd.has("isActive")) o.isActive = "false";
    await saveTaxonomy(db, user, kind, o);
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
    return { ok: true, message: "ذخیره شد." };
  });
}
