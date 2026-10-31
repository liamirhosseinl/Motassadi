"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import {
  bulkPropertyAction, changePropertyStatus, createProperty, duplicateProperty, setFeatured, updateProperty, updatePropertyImages,
  type BulkAction, type PropertyStatus,
} from "@/server/services/properties";

function refreshPublic(ref?: string) {
  revalidatePath("/");
  revalidatePath("/properties");
  if (ref) revalidatePath(`/properties/${ref}`);
}

export async function createPropertyAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = 0;
  const res = await staffAction(["properties.edit"], async ({ db, user }) => {
    id = (await createProperty(db, user, formObject(fd))).id;
  });
  if (!res.ok) return res;
  redirect(`/admin/properties/${id}?created=1`);
}

export async function updatePropertyAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return staffAction(["properties.edit"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    const version = Number(fd.get("version"));
    const row = await updateProperty(db, user, id, formObject(fd), version);
    refreshPublic(row.ref);
    revalidatePath(`/admin/properties/${id}`);
    return { ok: true, message: "تغییرات ذخیره شد." };
  });
}

export async function statusAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return staffAction(["properties.edit"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    const to = String(fd.get("to")) as PropertyStatus;
    const row = await changePropertyStatus(db, user, id, to, String(fd.get("note") ?? "") || null);
    refreshPublic(row.ref);
    revalidatePath(`/admin/properties/${id}`);
    return { ok: true, message: "وضعیت به‌روز شد." };
  });
}

export async function featureAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return staffAction(["properties.publish"], async ({ db, user }) => {
    const id = Number(fd.get("id"));
    await setFeatured(db, user, id, fd.get("featured") === "1");
    refreshPublic();
    revalidatePath(`/admin/properties/${id}`);
    return { ok: true, message: fd.get("featured") === "1" ? "آگهی ویژه شد." : "آگهی از حالت ویژه خارج شد." };
  });
}

export async function duplicateAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = 0;
  const res = await staffAction(["properties.edit"], async ({ db, user }) => {
    id = (await duplicateProperty(db, user, Number(fd.get("id")))).id;
  });
  if (!res.ok) return res;
  redirect(`/admin/properties/${id}?created=1`);
}

export async function bulkAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return staffAction(["properties.archive"], async ({ db, user }) => {
    const ids = fd.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const action = String(fd.get("bulk")) as BulkAction;
    if (!["unpublish", "archive", "unfeature"].includes(action)) return { ok: false, message: "عملیات معتبر نیست." };
    if (!ids.length) return { ok: false, message: "هیچ ملکی انتخاب نشده است." };
    const r = await bulkPropertyAction(db, user, ids, action);
    refreshPublic();
    revalidatePath("/admin/properties");
    return { ok: true, message: `${r.done} مورد انجام شد${r.skipped ? `، ${r.skipped} مورد مجاز نبود و رد شد` : ""}.` };
  });
}

export async function imagesAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return staffAction(["properties.edit"], async ({ db, user }) => {
    const id = Number(fd.get("propertyId"));
    const op = String(fd.get("op"));
    const order = String(fd.get("order") ?? "").split(",").map(Number).filter(Boolean);
    const target = Number(fd.get("imageId"));
    if (op === "cover") await updatePropertyImages(db, user, id, { coverId: target });
    else if (op === "remove") await updatePropertyImages(db, user, id, { removeId: target });
    else if (op === "up" || op === "down") {
      const i = order.indexOf(target);
      const j = op === "up" ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]];
      await updatePropertyImages(db, user, id, { order });
    } else if (op === "alt") {
      await updatePropertyImages(db, user, id, { alts: { [target]: String(fd.get("alt") ?? "") } });
    } else return { ok: false, message: "عملیات معتبر نیست." };
    revalidatePath(`/admin/properties/${id}`);
    refreshPublic();
    return { ok: true, message: "عکس‌ها به‌روز شد." };
  });
}
