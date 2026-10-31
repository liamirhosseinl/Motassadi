"use server";

import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import { updatePage } from "@/server/services/admin";

const PUBLIC_PATH: Record<string, string> = { about: "/about", privacy: "/privacy", terms: "/terms", "buy-sell": "/guide/buy-sell", rent: "/guide/rent" };

export async function updatePageAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["content.manage"], async ({ db, user }) => {
    const slug = String(fd.get("slug"));
    await updatePage(db, user, slug, formObject(fd));
    if (PUBLIC_PATH[slug]) revalidatePath(PUBLIC_PATH[slug]);
    revalidatePath("/admin/content");
    return { ok: true, message: "ذخیره شد و روی سایت به‌روز شد." };
  });
}
