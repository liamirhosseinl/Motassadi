import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { activeCategories, activeFeatures } from "@/server/services/properties";
import { staffOptions } from "@/server/services/admin";
import { Breadcrumbs } from "@/components/ui";
import { PropertyForm } from "../form";
import { createPropertyAction } from "../actions";
import { ownerOptions } from "../data";

export const metadata = { title: "ثبت ملک" };

export default async function NewProperty() {
  const user = await requirePage("properties.edit");
  const db = await getDb();
  const [categories, features, staff, owners] = await Promise.all([activeCategories(db), activeFeatures(db), staffOptions(db), ownerOptions()]);
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/properties", label: "املاک" }, { label: "ثبت ملک" }]} />
      <div className="page-header"><h1>ثبت ملک جدید</h1></div>
      <p className="muted small">ملک ابتدا به‌صورت پیش‌نویس ذخیره می‌شود. پس از افزودن عکس می‌توانید آن را منتشر کنید یا برای بررسی بفرستید.</p>
      <PropertyForm action={createPropertyAction} categories={categories} features={features} staff={staff} owners={owners} canAssign={user.permissions.has("properties.viewAll")} />
    </>
  );
}
