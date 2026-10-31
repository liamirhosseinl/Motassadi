import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import { INQUIRY_SOURCES } from "@/lib/vocab";
import { Breadcrumbs } from "@/components/ui";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { staffInquiryAction } from "../actions";

export const metadata = { title: "ثبت درخواست" };

export default async function NewInquiry() {
  await requirePage("inquiries.manage");
  const db = await getDb();
  const props = await db.select({ id: s.properties.id, ref: s.properties.ref, title: s.properties.title }).from(s.properties)
    .where(inArray(s.properties.status, ["published", "reserved", "draft", "pending_review", "unpublished"])).orderBy(desc(s.properties.updatedAt)).limit(300);
  const sources = Object.entries(INQUIRY_SOURCES).filter(([k]) => !k.startsWith("website"));
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/inquiries", label: "درخواست‌ها" }, { label: "ثبت درخواست" }]} />
      <div className="page-header"><h1>ثبت درخواست تلفنی یا حضوری</h1></div>
      <ActionForm action={staffInquiryAction} className="panel stack">
        <div className="form-grid">
          <TextField label="نام" name="name" required maxLength={80} />
          <TextField label="شمارهٔ تماس" name="phone" required dir="ltr" inputMode="tel" />
          <SelectField label="منبع" name="source" defaultValue="phone">{sources.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
          <SelectField label="ملک مرتبط" name="propertyId"><option value="">— عمومی —</option>{props.map((p) => <option key={p.id} value={p.id}>{p.ref} — {p.title}</option>)}</SelectField>
          <TextAreaField className="span-all" label="درخواست" name="message" maxLength={1500} />
        </div>
        <div className="row"><SubmitButton>ثبت</SubmitButton></div>
      </ActionForm>
    </>
  );
}
