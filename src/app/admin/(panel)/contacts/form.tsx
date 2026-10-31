import type * as s from "@/server/db/schema";
import { CONTACT_METHODS, CONTACT_STATUSES, CONTACT_TYPES, INQUIRY_SOURCES } from "@/lib/vocab";
import { ActionForm, FieldError, MoneyField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import type { ActionResult } from "@/server/services/common";

type C = typeof s.contacts.$inferSelect;
type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const SOURCES = { website: "سایت", phone: INQUIRY_SOURCES.phone, walk_in: INQUIRY_SOURCES.walk_in, referral: INQUIRY_SOURCES.referral, instagram: INQUIRY_SOURCES.instagram, whatsapp: INQUIRY_SOURCES.whatsapp, other: INQUIRY_SOURCES.other };

export function ContactForm({ action, c, categories, staff }: {
  action: Action; c?: C; categories: { id: number; name: string }[]; staff: { id: number; name: string }[];
}) {
  const types = c?.types ?? [];
  const cats = c?.preferredCategoryIds ?? [];
  return (
    <ActionForm action={action} className="stack" successMessage="ذخیره شد.">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset className="group">
        <legend>مشخصات</legend>
        <div className="form-grid">
          <TextField label="نام و نام خانوادگی" name="fullName" required defaultValue={c?.fullName} maxLength={120} />
          <TextField label="شمارهٔ تماس" name="phone" required defaultValue={c?.phone} dir="ltr" inputMode="tel" />
          <TextField label="شمارهٔ دوم" name="phone2" defaultValue={c?.phone2 ?? ""} dir="ltr" inputMode="tel" />
          <TextField label="ایمیل" name="email" type="email" defaultValue={c?.email ?? ""} dir="ltr" />
          <SelectField label="روش ارتباط ترجیحی" name="preferredMethod" defaultValue={c?.preferredMethod ?? ""}>
            <option value="">—</option>{Object.entries(CONTACT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
          <SelectField label="آشنایی از طریق" name="source" defaultValue={c?.source ?? ""}>
            <option value="">—</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
          <SelectField label="مسئول" name="agentId" defaultValue={c?.agentId ?? ""}>
            <option value="">—</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectField>
          <SelectField label="وضعیت" name="status" defaultValue={c?.status ?? "active"}>
            {Object.entries(CONTACT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
        </div>
        <div className="field">
          <span className="label">نوع مخاطب <span aria-hidden="true" className="req">*</span></span>
          <div className="checks">
            {Object.entries(CONTACT_TYPES).map(([k, v]) => <label key={k} className="check"><input type="checkbox" name="types[]" value={k} defaultChecked={types.includes(k)} />{v}</label>)}
          </div>
          <FieldError name="types" />
        </div>
      </fieldset>
      <fieldset className="group">
        <legend>نیاز و بودجه</legend>
        <div className="form-grid">
          <MoneyField label="حداقل بودجه" name="budgetMin" defaultValue={num(c?.budgetMin)} />
          <MoneyField label="حداکثر بودجه" name="budgetMax" defaultValue={num(c?.budgetMax)} />
          <TextField className="span-all" label="محله‌های مورد نظر" name="preferredLocations" defaultValue={c?.preferredLocations ?? ""} maxLength={300} />
          <TextAreaField className="span-all" label="شرح نیاز" name="requirements" defaultValue={c?.requirements ?? ""} maxLength={3000} />
        </div>
        <div className="field">
          <span className="label">نوع ملک مورد نظر</span>
          <div className="checks">
            {categories.map((x) => <label key={x.id} className="check"><input type="checkbox" name="preferredCategoryIds[]" value={x.id} defaultChecked={cats.includes(x.id)} />{x.name}</label>)}
          </div>
        </div>
      </fieldset>
      <fieldset className="group">
        <legend>یادداشت داخلی</legend>
        <TextAreaField label="یادداشت" name="notes" defaultValue={c?.notes ?? ""} maxLength={5000} hint="فقط کارکنان می‌بینند." />
      </fieldset>
      <div className="row">
        <SubmitButton>{c ? "ذخیرهٔ تغییرات" : "ثبت مخاطب"}</SubmitButton>
        <label className="check small"><input type="checkbox" name="force" value="1" />ثبت با وجود شمارهٔ تکراری</label>
      </div>
    </ActionForm>
  );
}
