import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { readSettings } from "@/server/services/settings";
import { taxonomies } from "@/server/services/admin";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { Badge } from "@/components/ui";
import { settingsAction, taxonomyAction } from "./actions";

export const metadata = { title: "تنظیمات" };

function Group({ group, title, children, note }: { group: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <ActionForm action={settingsAction} className="panel stack">
      <input type="hidden" name="group" value={group} />
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      {note && <p className="small muted">{note}</p>}
      <div className="form-grid">{children}</div>
      <div className="row"><SubmitButton className="btn btn-navy">ذخیره</SubmitButton></div>
    </ActionForm>
  );
}

export default async function SettingsPage() {
  await requirePage("settings.manage");
  const db = await getDb();
  const [st, tax] = await Promise.all([readSettings(db), taxonomies(db)]);
  return (
    <>
      <div className="page-header"><h1>تنظیمات</h1></div>
      <div className="stack" style={{ gap: 20 }}>
        <Group group="business" title="اطلاعات کسب‌وکار" note="روی سایت، پاورقی، صفحهٔ تماس و داده‌های ساختاریافتهٔ موتور جست‌وجو نمایش داده می‌شود. فقط اطلاعات درست و تأییدشده وارد کنید.">
          <TextField label="نام دفتر" name="name" required defaultValue={st.business.name} />
          <TextField label="نام مدیر" name="ownerName" required defaultValue={st.business.ownerName} />
          <TextField className="span-all" label="نشانی" name="address" required defaultValue={st.business.address} />
          <TextField label="تلفن" name="phone" required dir="ltr" defaultValue={st.business.phone} />
          <TextField label="واتساپ" name="whatsapp" required dir="ltr" defaultValue={st.business.whatsapp} />
          <TextField label="شهر" name="city" required defaultValue={st.business.city} />
          <TextField label="استان" name="province" required defaultValue={st.business.province} />
        </Group>
        <Group group="site" title="متن‌های سایت">
          <TextField className="span-all" label="شعار" name="tagline" required defaultValue={st.site.tagline} />
          <TextAreaField className="span-all" label="توضیح کوتاه سایت (برای موتور جست‌وجو)" name="description" required defaultValue={st.site.description} maxLength={300} />
        </Group>
        <Group group="social" title="شبکه‌های اجتماعی" note="فقط حساب‌هایی را وارد کنید که واقعاً متعلق به دفتر است. خالی بماند، نمایش داده نمی‌شود.">
          <TextField label="اینستاگرام (نام کاربری)" name="instagram" dir="ltr" defaultValue={st.social.instagram} />
          <TextField label="تلگرام (نام کاربری)" name="telegram" dir="ltr" defaultValue={st.social.telegram} />
        </Group>
        <Group group="currency" title="واحد نمایش پول" note="مبالغ همیشه به تومان ذخیره می‌شوند. این گزینه فقط واحد نمایش را عوض می‌کند (ریال = تومان × ۱۰).">
          <SelectField label="نمایش" name="display" defaultValue={st.currency.display}><option value="toman">تومان</option><option value="rial">ریال</option></SelectField>
        </Group>
        <Group group="refs" title="پیشوند کدها" note="روی کدهای جدید اثر دارد؛ کدهای قبلی تغییر نمی‌کنند.">
          <TextField label="پیشوند ملک" name="propertyPrefix" required dir="ltr" defaultValue={st.refs.propertyPrefix} />
          <TextField label="پیشوند معامله" name="transactionPrefix" required dir="ltr" defaultValue={st.refs.transactionPrefix} />
        </Group>
        <Group group="publishing" title="قوانین انتشار آگهی">
          <label className="check"><input type="checkbox" name="requireImage" defaultChecked={st.publishing.requireImage} />انتشار بدون عکس مجاز نباشد</label>
          <label className="check"><input type="checkbox" name="requireDescription" defaultChecked={st.publishing.requireDescription} />انتشار بدون توضیحات مجاز نباشد</label>
        </Group>
        <Group group="commission" title="کمیسیون" note="فقط پیش‌فرض فرم است و هر معامله جداگانه قابل تغییر است. نرخ قانونی را خودتان بررسی کنید؛ سامانه نرخی را تعیین نمی‌کند.">
          <TextField label="درصد پیش‌فرض (اختیاری)" name="defaultRatePercent" dir="ltr" defaultValue={st.commission.defaultRatePercent ?? ""} />
        </Group>
        <Group group="privacy" title="متن اطلاع‌رسانی فرم درخواست">
          <TextAreaField className="span-all" label="متن" name="inquiryNotice" required defaultValue={st.privacy.inquiryNotice} maxLength={500} />
        </Group>

        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>نوع ملک</h2>
          <TaxTable kind="category" rows={tax.categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, extra: c.hasRooms, sub: c.slug }))} extraLabel="خواب و طبقه دارد" extraName="hasRooms" />
          <ActionForm action={taxonomyAction} className="toolbar" resetOnSuccess>
            <input type="hidden" name="kind_" value="category" />
            <TextField label="نام نوع جدید" name="name" required />
            <TextField label="شناسهٔ لاتین" name="slug" required dir="ltr" placeholder="office" />
            <label className="check"><input type="checkbox" name="hasRooms" />خواب و طبقه دارد</label>
            <SubmitButton className="btn btn-outline">افزودن</SubmitButton>
          </ActionForm>
        </section>
        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>امکانات ملک</h2>
          <TaxTable kind="feature" rows={tax.features.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))} />
          <ActionForm action={taxonomyAction} className="toolbar" resetOnSuccess>
            <input type="hidden" name="kind_" value="feature" />
            <TextField label="امکان جدید" name="name" required />
            <SubmitButton className="btn btn-outline">افزودن</SubmitButton>
          </ActionForm>
        </section>
        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>دسته‌های مالی</h2>
          <p className="small muted">دسته‌هایی که «کمیسیون» علامت دارند در محاسبهٔ کمیسیون دریافتی معاملات شمرده می‌شوند (دریافت: افزایش، هزینه: استرداد).</p>
          <TaxTable kind="finance" rows={tax.finance.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, extra: c.isCommission, sub: c.kind === "income" ? "دریافت" : "هزینه" }))} extraLabel="کمیسیون" extraName="isCommission" />
          <ActionForm action={taxonomyAction} className="toolbar" resetOnSuccess>
            <input type="hidden" name="kind_" value="finance" />
            <SelectField label="نوع" name="kind"><option value="income">دریافت</option><option value="expense">هزینه</option></SelectField>
            <TextField label="نام دسته" name="name" required />
            <label className="check"><input type="checkbox" name="isCommission" />کمیسیون</label>
            <SubmitButton className="btn btn-outline">افزودن</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function TaxTable({ kind, rows, extraLabel, extraName }: {
  kind: string; rows: { id: number; name: string; isActive: boolean; extra?: boolean; sub?: string }[]; extraLabel?: string; extraName?: string;
}) {
  return (
    <ul className="stack" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
      {rows.map((r) => (
        <li key={r.id} style={{ borderBottom: "1px solid var(--divider)", paddingBottom: 6 }}>
          <ActionForm action={taxonomyAction} className="row">
            <input type="hidden" name="kind_" value={kind} />
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="kind" value={r.sub === "هزینه" ? "expense" : "income"} />
            <label className="sr-only" htmlFor={`tx-${kind}-${r.id}`}>نام</label>
            <input id={`tx-${kind}-${r.id}`} className="input" name="name" defaultValue={r.name} style={{ flex: "1 1 200px", maxWidth: 320 }} />
            {r.sub && <span className="tiny muted">{r.sub}</span>}
            <label className="check"><input type="checkbox" name="isActive" defaultChecked={r.isActive} />فعال</label>
            {extraName && <label className="check"><input type="checkbox" name={extraName} defaultChecked={r.extra} />{extraLabel}</label>}
            {!r.isActive && <Badge tone="muted">غیرفعال</Badge>}
            <SubmitButton className="btn btn-ghost btn-sm">ذخیره</SubmitButton>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}
