import { randomUUID } from "node:crypto";
import { asc, desc, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import { financeCategoriesList } from "@/server/services/deals";
import { PAYMENT_METHODS } from "@/lib/vocab";
import { isoDateToJalaliLatin, todayIso } from "@/lib/format";
import { Breadcrumbs } from "@/components/ui";
import { ActionForm, MoneyField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { createFinanceAction } from "../actions";

export const metadata = { title: "ثبت مالی" };

export default async function NewFinance({ searchParams }: { searchParams: Promise<{ tx?: string; kind?: string }> }) {
  await requirePage("finance.manage");
  const sp = await searchParams;
  const db = await getDb();
  const [cats, txs, contacts] = await Promise.all([
    financeCategoriesList(db),
    db.select({ id: s.transactions.id, code: s.transactions.code }).from(s.transactions).where(sql`${s.transactions.status} <> 'cancelled'`).orderBy(desc(s.transactions.createdAt)).limit(300),
    db.select({ id: s.contacts.id, fullName: s.contacts.fullName }).from(s.contacts).where(sql`${s.contacts.status} <> 'archived'`).orderBy(asc(s.contacts.fullName)).limit(2000),
  ]);
  const txId = Number(sp.tx) || null;
  const kind = sp.kind === "expense" ? "expense" : "income";
  const commission = cats.find((c) => c.kind === "income" && c.isCommission);
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/finance", label: "مالی" }, { label: "ثبت جدید" }]} />
      <div className="page-header"><h1>ثبت دریافت یا هزینه</h1></div>
      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        فقط پولی را که واقعاً دریافت یا پرداخت شده ثبت کنید. ارزش ملک یا مبلغ معامله درآمد دفتر نیست؛ درآمد دفتر کمیسیون است.
      </div>
      <ActionForm action={createFinanceAction} className="panel stack">
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <div className="form-grid">
          <SelectField label="نوع" name="kind" required defaultValue={kind}>
            <option value="income">دریافت (درآمد)</option>
            <option value="expense">پرداخت (هزینه)</option>
          </SelectField>
          <SelectField label="دسته" name="categoryId" required defaultValue={txId && kind === "income" ? commission?.id : ""} hint="دستهٔ انتخابی باید با نوع ثبت یکی باشد.">
            <option value="">انتخاب کنید</option>
            <optgroup label="دریافت">{cats.filter((c) => c.kind === "income").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="پرداخت">{cats.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </SelectField>
          <MoneyField label="مبلغ" name="amount" required />
          <TextField label="تاریخ (شمسی)" name="entryDate" required dir="ltr" defaultValue={isoDateToJalaliLatin(todayIso())} hint="تاریخ آینده پذیرفته نمی‌شود." />
          <SelectField label="روش پرداخت" name="method"><option value="">—</option>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
          <TextField label="شمارهٔ پیگیری / رسید" name="referenceNo" dir="ltr" maxLength={80} />
          <SelectField label="معامله" name="transactionId" defaultValue={txId ?? ""} hint="برای کمیسیون الزامی است.">
            <option value="">—</option>{txs.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
          </SelectField>
          <SelectField label="طرف حساب" name="contactId"><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</SelectField>
          <TextAreaField className="span-all" label="شرح" name="description" maxLength={1000} />
          <div className="field span-all">
            <label htmlFor="attachment">پیوست رسید (اختیاری)</label>
            <input id="attachment" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input" />
            <span className="hint">PDF، JPG، PNG یا WebP — حداکثر ۱۰ مگابایت.</span>
          </div>
        </div>
        <div className="row"><SubmitButton>ثبت</SubmitButton></div>
      </ActionForm>
    </>
  );
}
