import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { activeCategories, listAdminProperties } from "@/server/services/properties";
import { staffOptions } from "@/server/services/admin";
import { DEAL_TYPES, PROPERTY_STATUSES } from "@/lib/vocab";
import { PAGE_SIZE } from "@/server/services/common";
import { faDigits, formatDate, formatMoneyShort } from "@/lib/format";
import { Badge, DealBadge, EmptyState, Icon, Ltr, Pagination, PropertyStatusBadge } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/form";
import { bulkAction } from "./actions";

export const metadata = { title: "املاک" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PropertiesAdmin({ searchParams }: { searchParams: SP }) {
  const user = await requirePage("properties.view");
  const params = await searchParams;
  const db = await getDb();
  const [res, cats, staff] = await Promise.all([listAdminProperties(db, user, params), activeCategories(db), staffOptions(db)]);
  const f = res.filters;
  const canBulk = user.permissions.has("properties.archive");
  const exportQs = new URLSearchParams(Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  return (
    <>
      <div className="page-header">
        <h1>املاک</h1>
        <div className="row">
          {user.permissions.has("export.data") && <a className="btn btn-outline btn-sm" href={`/api/admin/export/properties?${exportQs}`}><Icon name="download" size={16} />CSV</a>}
          {user.permissions.has("properties.edit") && <Link className="btn btn-primary" href="/admin/properties/new"><Icon name="plus" size={18} />ثبت ملک</Link>}
        </div>
      </div>
      <form method="get" className="toolbar" role="search" aria-label="فیلتر املاک">
        <div className="field"><label htmlFor="q">جست‌وجو</label><input id="q" name="q" className="input" defaultValue={f.q} placeholder="عنوان، کد یا محله" /></div>
        <div className="field"><label htmlFor="status">وضعیت</label>
          <select id="status" name="status" className="select" defaultValue={f.status ?? ""}><option value="">همه (بدون بایگانی)</option>{Object.entries(PROPERTY_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="deal">معامله</label>
          <select id="deal" name="deal" className="select" defaultValue={f.deal ?? ""}><option value="">همه</option>{Object.entries(DEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="cat">دسته</label>
          <select id="cat" name="cat" className="select" defaultValue={f.cat ?? ""}><option value="">همه</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {user.permissions.has("properties.viewAll") && (
          <div className="field"><label htmlFor="agent">مشاور</label>
            <select id="agent" name="agent" className="select" defaultValue={f.agent ?? ""}><option value="">همه</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        )}
        <button className="btn btn-navy" type="submit">اعمال</button>
        <Link className="btn btn-ghost" href="/admin/properties">پاک کردن</Link>
      </form>
      <p className="muted small" role="status">{faDigits(res.total)} مورد</p>
      {res.rows.length === 0 ? (
        <EmptyState title="ملکی پیدا نشد" action={user.permissions.has("properties.edit") ? <Link className="btn btn-primary" href="/admin/properties/new">ثبت ملک</Link> : undefined} />
      ) : (
        <ActionForm action={bulkAction} className="stack">
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">فهرست املاک</caption>
              <thead><tr>
                {canBulk && <th scope="col"><span className="sr-only">انتخاب</span></th>}
                <th scope="col">کد</th><th scope="col">عنوان</th><th scope="col">معامله</th><th scope="col">قیمت / ودیعه</th><th scope="col">وضعیت</th><th scope="col">مشاور</th><th scope="col">به‌روزرسانی</th>
              </tr></thead>
              <tbody>
                {res.rows.map(({ p, categoryName, agentName }) => (
                  <tr key={p.id}>
                    {canBulk && <td><input type="checkbox" name="ids" value={p.id} aria-label={`انتخاب ${p.title}`} style={{ width: 20, height: 20 }} /></td>}
                    <td className="num"><Ltr>{p.ref}</Ltr></td>
                    <td><Link href={`/admin/properties/${p.id}`}>{p.title}</Link><div className="tiny muted">{categoryName}{p.neighborhood ? ` · ${p.neighborhood}` : ""}</div></td>
                    <td><DealBadge deal={p.dealType} /></td>
                    <td className="num">{p.priceHidden ? <span className="muted">اعلام نمی‌شود</span> : formatMoneyShort(p.price ?? p.deposit)}</td>
                    <td><span className="row" style={{ gap: 4 }}><PropertyStatusBadge status={p.status} />{p.featured && <Badge tone="amber">ویژه</Badge>}</span></td>
                    <td>{agentName ?? <span className="muted">—</span>}</td>
                    <td className="num">{formatDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canBulk && (
            <div className="row">
              <label htmlFor="bulk" className="label">عملیات گروهی روی موارد انتخاب‌شده:</label>
              <select id="bulk" name="bulk" className="select" style={{ width: "auto" }} defaultValue="unpublish">
                <option value="unpublish">توقف انتشار</option><option value="unfeature">خروج از ویژه</option><option value="archive">بایگانی</option>
              </select>
              <ConfirmSubmit title="اجرای عملیات گروهی؟" body="عملیات روی همهٔ موارد انتخاب‌شده انجام می‌شود. مواردی که مجاز نباشند رد می‌شوند." confirmText="اجرا">اجرا</ConfirmSubmit>
            </div>
          )}
        </ActionForm>
      )}
      <Pagination page={res.page} total={res.total} pageSize={PAGE_SIZE} basePath="/admin/properties" params={params} />
    </>
  );
}
