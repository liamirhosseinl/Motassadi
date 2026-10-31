import type * as s from "@/server/db/schema";
import { PARTY_ROLES, TX_KINDS } from "@/lib/vocab";
import { isoDateToJalaliLatin } from "@/lib/format";
import { ActionForm, FieldError, MoneyField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import type { ActionResult } from "@/server/services/common";

type T = typeof s.transactions.$inferSelect;
type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const PARTY_SLOTS = 4;

export function TxForm({ action, t, parties = [], properties, contacts, staff, defaultPropertyId }: {
  action: Action; t?: T; parties?: { contactId: number; role: string }[];
  properties: { id: number; ref: string; title: string }[]; contacts: { id: number; fullName: string; phone: string }[];
  staff: { id: number; name: string }[]; defaultPropertyId?: number;
}) {
  const slots = Array.from({ length: Math.max(PARTY_SLOTS, parties.length + 1) }, (_, i) => parties[i]);
  return (
    <ActionForm action={action} className="stack" successMessage="ذخیره شد.">
      {t && <input type="hidden" name="id" value={t.id} />}
      {t && <input type="hidden" name="version" value={t.version} />}
      <fieldset className="group">
        <legend>معامله</legend>
        <div className="form-grid">
          <SelectField label="نوع" name="kind" required defaultValue={t?.kind ?? "sale"}>
            {Object.entries(TX_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
          <SelectField label="ملک" name="propertyId" defaultValue={t?.propertyId ?? defaultPropertyId ?? ""}>
            <option value="">— بدون ملک ثبت‌شده —</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.ref} — {p.title}</option>)}
          </SelectField>
          <TextField label="تاریخ معامله (شمسی)" name="transactionDate" dir="ltr" placeholder="1405/08/12" defaultValue={t?.transactionDate ? isoDateToJalaliLatin(t.transactionDate) : ""} hint="برای تکمیل معامله لازم است." />
          <SelectField label="مشاور مسئول" name="agentId" defaultValue={t?.agentId ?? ""}>
            <option value="">خودم</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectField>
          <MoneyField label="ارزش معامله / مبلغ رهن" name="dealAmount" defaultValue={num(t?.dealAmount)} hint="ارزش ملک — درآمد دفتر نیست." />
          <MoneyField label="اجارهٔ ماهانه" name="monthlyRent" defaultValue={num(t?.monthlyRent)} />
        </div>
      </fieldset>
      <fieldset className="group">
        <legend>کمیسیون (حق‌الزحمهٔ دفتر)</legend>
        <p className="small muted">کمیسیون مورد انتظار روی سرور از همین ورودی‌ها محاسبه می‌شود. مبلغ دریافتی فقط از ثبت‌های بخش مالی می‌آید.</p>
        <div className="form-grid">
          <SelectField label="روش محاسبه" name="commissionMode" defaultValue={t?.commissionMode ?? "fixed"}>
            <option value="fixed">مبلغ ثابت</option>
            <option value="percent">درصدی از ارزش معامله</option>
          </SelectField>
          <TextField label="درصد" name="commissionRate" dir="ltr" inputMode="decimal" placeholder="0.5" defaultValue={t?.commissionRateBp != null ? String(t.commissionRateBp / 100) : ""} hint="فقط برای روش درصدی؛ مثلاً 0.5" />
          <MoneyField label="مبلغ ثابت کمیسیون" name="commissionFixed" defaultValue={num(t?.commissionFixed)} hint="فقط برای روش مبلغ ثابت" />
        </div>
      </fieldset>
      <fieldset className="group">
        <legend>طرفین معامله</legend>
        <p className="small muted">اگر مخاطب در فهرست نیست، اول از بخش «مخاطبان» ثبتش کنید.</p>
        {slots.map((p, i) => (
          <div className="party-row" key={i}>
            <div className="field">
              <label htmlFor={`pc${i}`} className="sr-only">طرف {i + 1}</label>
              <select id={`pc${i}`} name="partyContact[]" className="select" defaultValue={p?.contactId ?? ""}>
                <option value="">— انتخاب مخاطب —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.phone})</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`pr${i}`} className="sr-only">نقش طرف {i + 1}</label>
              <select id={`pr${i}`} name="partyRole[]" className="select" defaultValue={p?.role ?? "buyer"}>
                {Object.entries(PARTY_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        ))}
        <FieldError name="partyContact" />
      </fieldset>
      <fieldset className="group">
        <legend>یادداشت داخلی</legend>
        <TextAreaField label="یادداشت" name="notes" defaultValue={t?.notes ?? ""} maxLength={5000} />
      </fieldset>
      <div className="row"><SubmitButton>{t ? "ذخیرهٔ تغییرات" : "ثبت معامله"}</SubmitButton></div>
    </ActionForm>
  );
}
