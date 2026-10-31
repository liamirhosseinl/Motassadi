import type * as s from "@/server/db/schema";
import { DEAL_TYPES } from "@/lib/vocab";
import { faDigits } from "@/lib/format";
import { ActionForm, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, FieldError } from "@/components/form";
import type { ActionResult } from "@/server/services/common";

type P = typeof s.properties.$inferSelect;
type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function PropertyForm({ action, p, featureIds = [], categories, features, staff, owners, canAssign }: {
  action: Action; p?: P; featureIds?: number[];
  categories: { id: number; name: string; hasRooms: boolean }[]; features: { id: number; name: string }[];
  staff: { id: number; name: string }[]; owners: { id: number; fullName: string; phone: string }[]; canAssign: boolean;
}) {
  return (
    <ActionForm action={action} className="stack" successMessage="ذخیره شد.">
      {p && <input type="hidden" name="id" value={p.id} />}
      {p && <input type="hidden" name="version" value={p.version} />}
      <fieldset className="group">
        <legend>اطلاعات اصلی</legend>
        <div className="form-grid">
          <TextField className="span-all" label="عنوان آگهی" name="title" required defaultValue={p?.title} maxLength={150} hint="مثلاً «آپارتمان ۹۵ متری، شهرک فرهنگیان»" />
          <SelectField label="نوع معامله" name="dealType" required defaultValue={p?.dealType ?? "sale"}>
            {Object.entries(DEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectField>
          <SelectField label="نوع ملک" name="categoryId" required defaultValue={p?.categoryId ?? ""} hint="برای زمین، باغ و تجاری، تعداد خواب و طبقه ذخیره نمی‌شود.">
            <option value="">انتخاب کنید</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <TextAreaField className="span-all" label="توضیحات عمومی" name="description" defaultValue={p?.description ?? ""} maxLength={8000} hint="روی سایت نمایش داده می‌شود. فقط واقعیت‌های قابل‌بررسی بنویسید." />
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>قیمت (به تومان)</legend>
        <div className="form-grid">
          <MoneyField label="قیمت فروش / معاوضه" name="price" defaultValue={num(p?.price)} hint="برای فروش" />
          <MoneyField label="ودیعه / مبلغ رهن" name="deposit" defaultValue={num(p?.deposit)} hint="برای اجاره و رهن" />
          <MoneyField label="اجارهٔ ماهانه" name="rentMonthly" defaultValue={num(p?.rentMonthly)} />
          <div className="field">
            <span className="label">نمایش قیمت</span>
            <label className="check"><input type="checkbox" name="priceNegotiable" defaultChecked={p?.priceNegotiable} />قابل مذاکره</label>
            <label className="check"><input type="checkbox" name="priceHidden" defaultChecked={p?.priceHidden} />قیمت در سایت اعلام نشود</label>
          </div>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>مشخصات</legend>
        <div className="form-grid">
          <TextField label="متراژ (متر مربع)" name="area" inputMode="numeric" defaultValue={num(p?.area)} dir="ltr" />
          <TextField label="مساحت زمین" name="landArea" inputMode="numeric" defaultValue={num(p?.landArea)} dir="ltr" />
          <TextField label="زیربنا" name="buildingArea" inputMode="numeric" defaultValue={num(p?.buildingArea)} dir="ltr" />
          <TextField label="تعداد اتاق" name="rooms" inputMode="numeric" defaultValue={num(p?.rooms)} dir="ltr" />
          <TextField label="اتاق خواب" name="bedrooms" inputMode="numeric" defaultValue={num(p?.bedrooms)} dir="ltr" />
          <TextField label="سرویس بهداشتی" name="bathrooms" inputMode="numeric" defaultValue={num(p?.bathrooms)} dir="ltr" />
          <TextField label="طبقه" name="floor" inputMode="numeric" defaultValue={num(p?.floor)} dir="ltr" />
          <TextField label="تعداد کل طبقات" name="totalFloors" inputMode="numeric" defaultValue={num(p?.totalFloors)} dir="ltr" />
          <TextField label="سال ساخت (شمسی)" name="buildYear" inputMode="numeric" defaultValue={num(p?.buildYear)} placeholder="1398" dir="ltr" />
          <TextField label="وضعیت بنا" name="condition" defaultValue={p?.condition ?? ""} placeholder="نوساز، بازسازی‌شده، …" />
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <span className="label">امکانات</span>
          <div className="checks">
            {features.map((f) => <label key={f.id} className="check"><input type="checkbox" name="featureIds[]" value={f.id} defaultChecked={featureIds.includes(f.id)} />{f.name}</label>)}
          </div>
          <FieldError name="featureIds" />
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>موقعیت</legend>
        <div className="form-grid">
          <TextField label="شهر" name="city" required defaultValue={p?.city ?? "زرند"} />
          <TextField label="محله" name="neighborhood" defaultValue={p?.neighborhood ?? ""} hint="در سایت و فیلتر جست‌وجو نمایش داده می‌شود." />
          <TextField label="موقعیت عمومی" name="publicLocation" defaultValue={p?.publicLocation ?? ""} hint="مثلاً «نزدیک بلوار امام» — بدون پلاک" />
          <TextAreaField className="span-all" label="نشانی دقیق (محرمانه)" name="address" defaultValue={p?.address ?? ""} hint="فقط در پنل دیده می‌شود و هرگز در سایت نمایش داده نمی‌شود." style={{ minHeight: 70 }} />
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>داخلی و سئو</legend>
        <div className="form-grid">
          <SelectField label="مالک" name="ownerContactId" defaultValue={p?.ownerContactId ?? ""} hint="از مخاطبان ثبت‌شده">
            <option value="">— انتخاب نشده —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName} ({faDigits(o.phone)})</option>)}
          </SelectField>
          {canAssign ? (
            <SelectField label="مشاور مسئول" name="agentId" defaultValue={p?.agentId ?? ""}>
              <option value="">— بدون مسئول —</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectField>
          ) : <input type="hidden" name="agentId" value={p?.agentId ?? ""} />}
          <TextAreaField className="span-all" label="یادداشت داخلی (محرمانه)" name="internalNotes" defaultValue={p?.internalNotes ?? ""} style={{ minHeight: 70 }} />
          <TextField label="عنوان سئو (اختیاری)" name="seoTitle" defaultValue={p?.seoTitle ?? ""} maxLength={120} hint="خالی بماند تا از عنوان آگهی ساخته شود." />
          <TextField label="توضیح سئو (اختیاری)" name="seoDescription" defaultValue={p?.seoDescription ?? ""} maxLength={300} />
        </div>
      </fieldset>
      <div className="row save-bar">
        <SubmitButton>{p ? "ذخیرهٔ تغییرات" : "ذخیره به‌عنوان پیش‌نویس"}</SubmitButton>
        <a className="btn btn-ghost" href={p ? `/admin/properties/${p.id}` : "/admin/properties"}>انصراف</a>
      </div>
    </ActionForm>
  );
}
