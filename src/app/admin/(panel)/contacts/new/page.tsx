import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { activeCategories } from "@/server/services/properties";
import { staffOptions } from "@/server/services/admin";
import { Breadcrumbs } from "@/components/ui";
import { ContactForm } from "../form";
import { createContactAction } from "../actions";

export const metadata = { title: "مخاطب جدید" };

export default async function NewContact() {
  await requirePage("contacts.manage");
  const db = await getDb();
  const [categories, staff] = await Promise.all([activeCategories(db), staffOptions(db)]);
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/contacts", label: "مخاطبان" }, { label: "مخاطب جدید" }]} />
      <div className="page-header"><h1>مخاطب جدید</h1></div>
      <ContactForm action={createContactAction} categories={categories} staff={staff} />
    </>
  );
}
