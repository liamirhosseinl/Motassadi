import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { auditList } from "@/server/services/admin";
import { faDigits, formatDateTime } from "@/lib/format";
import { Pagination } from "@/components/ui";

export const metadata = { title: "گزارش رویدادها" };

const LABELS: Record<string, string> = {
  "auth.login": "ورود", "auth.failed": "ورود ناموفق", "auth.logout": "خروج",
  "property.create": "ساخت آگهی", "property.update": "ویرایش آگهی", "property.status": "تغییر وضعیت آگهی", "property.featured": "آگهی ویژه",
  "property.images": "تغییر عکس‌ها", "property.image.add": "افزودن عکس", "property.bulk": "عملیات گروهی آگهی", "property.duplicate": "کپی آگهی",
  "inquiry.create": "درخواست جدید", "inquiry.status": "وضعیت درخواست", "inquiry.assign": "واگذاری درخواست",
  "contact.create": "ساخت مخاطب", "contact.update": "ویرایش مخاطب", "followup.create": "ثبت پیگیری",
  "transaction.create": "ساخت معامله", "transaction.update": "ویرایش معامله", "transaction.status": "وضعیت معامله", "transaction.reopen": "بازگشایی معامله",
  "finance.create": "ثبت مالی", "finance.void": "ابطال ثبت مالی", "export.csv": "خروجی CSV",
  "settings.update": "تغییر تنظیمات", "taxonomy.save": "تغییر دسته‌بندی", "page.update": "ویرایش صفحه",
  "user.create": "ساخت کاربر", "user.update": "ویرایش کاربر", "user.password": "تغییر رمز", "role.permissions": "تغییر دسترسی نقش",
};

export default async function Audit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePage("audit.view");
  const page = Math.max(1, Math.min(10000, Number((await searchParams).page) || 1));
  const { rows, total } = await auditList(await getDb(), user, page);
  return (
    <>
      <div className="page-header"><h1>گزارش رویدادها</h1></div>
      <p className="muted small" style={{ marginBottom: 12 }}>رویدادهای حساس (ورود، تغییرات مالی، دسترسی‌ها و تنظیمات) اینجا ثبت می‌شود و از پنل قابل حذف نیست. {faDigits(total)} رویداد.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">زمان</th><th scope="col">کاربر</th><th scope="col">رویداد</th><th scope="col">موضوع</th><th scope="col">جزئیات</th></tr></thead>
          <tbody>
            {rows.map(({ a, by }) => (
              <tr key={a.id}>
                <td className="num small">{formatDateTime(a.createdAt)}</td>
                <td>{by ?? "—"}</td>
                <td>{LABELS[a.action] ?? a.action}</td>
                <td className="small"><span className="mono">{a.entity}{a.entityId ? ` #${a.entityId}` : ""}</span></td>
                <td className="small"><span className="mono" style={{ wordBreak: "break-all" }}>{a.details ? JSON.stringify(a.details).slice(0, 200) : ""}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} pageSize={50} basePath="/admin/audit" params={{}} />
    </>
  );
}
