"use server";

import { revalidatePath } from "next/cache";
import { staffAction } from "@/server/action";
import { formObject, type ActionResult } from "@/server/services/common";
import { createUser, setRolePermissions, setUserPassword, updateUser } from "@/server/services/admin";
import { ROLES, type Role } from "@/server/auth/permissions";

export async function createUserAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["users.manage"], async ({ db, user }) => {
    const pw = String(fd.get("password") ?? "");
    if (pw !== String(fd.get("password2") ?? "")) return { ok: false, message: "تکرار رمز یکسان نیست.", fieldErrors: { password2: "یکسان نیست" } };
    await createUser(db, user, { ...formObject(fd), isActive: "on" }, pw);
    revalidatePath("/admin/users");
    return { ok: true, message: "کاربر ساخته شد. رمز را حضوری یا از راه امن به او بدهید و بخواهید پس از ورود عوضش کند." };
  });
}

export async function updateUserAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["users.manage"], async ({ db, user }) => {
    await updateUser(db, user, Number(fd.get("id")), formObject(fd));
    revalidatePath("/admin/users");
    return { ok: true, message: "ذخیره شد." };
  });
}

export async function resetPasswordAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["users.manage"], async ({ db, user }) => {
    await setUserPassword(db, user, Number(fd.get("id")), String(fd.get("password") ?? ""));
    return { ok: true, message: "رمز تغییر کرد و نشست‌های فعال این کاربر بسته شد." };
  });
}

export async function rolePermsAction(_p: ActionResult | null, fd: FormData) {
  return staffAction(["users.manage"], async ({ db, user }) => {
    const role = String(fd.get("role"));
    if (!(role in ROLES)) return { ok: false, message: "نقش نامعتبر است." };
    await setRolePermissions(db, user, role as Role, fd.getAll("perm").map(String));
    revalidatePath("/admin", "layout");
    return { ok: true, message: `دسترسی‌های «${ROLES[role as Role]}» ذخیره شد.` };
  });
}
