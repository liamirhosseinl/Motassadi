import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { getPage } from "@/server/services/admin";
import { Breadcrumbs } from "@/components/ui";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { updatePageAction } from "../actions";

export const metadata = { title: "ویرایش صفحه" };

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePage("content.manage");
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) notFound();
  const p = await getPage(await getDb(), slug);
  if (!p) notFound();
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/content", label: "صفحات سایت" }, { label: p.title }]} />
      <div className="page-header"><h1>{p.title}</h1></div>
      <ActionForm action={updatePageAction} className="panel stack">
        <input type="hidden" name="slug" value={p.slug} />
        <TextField label="عنوان" name="title" required defaultValue={p.title} maxLength={120} />
        <TextAreaField label="متن" name="body" required defaultValue={p.body} maxLength={20000} style={{ minHeight: 360 }}
          hint="هر پاراگراف را با یک خط خالی جدا کنید. خطی که با «## » شروع شود تیتر است و خطی که با «- » شروع شود فهرست. HTML پذیرفته نمی‌شود." />
        <fieldset className="group">
          <legend>سئو</legend>
          <div className="form-grid">
            <TextField className="span-all" label="عنوان در نتایج جست‌وجو" name="seoTitle" defaultValue={p.seoTitle ?? ""} maxLength={120} />
            <TextAreaField className="span-all" label="توضیح در نتایج جست‌وجو" name="seoDescription" defaultValue={p.seoDescription ?? ""} maxLength={300} />
          </div>
        </fieldset>
        <label className="check"><input type="checkbox" name="needsReview" defaultChecked={p.needsReview} />هنوز نیاز به بازبینی دارد (روی سایت برچسب «پیش‌نویس» نشان داده می‌شود)</label>
        <div className="row"><SubmitButton>ذخیره</SubmitButton></div>
      </ActionForm>
    </>
  );
}
