import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { listInquiries } from "@/server/services/crm";
import { staffOptions } from "@/server/services/admin";
import { INQUIRY_SOURCES, INQUIRY_STATUSES } from "@/lib/vocab";
import { PAGE_SIZE } from "@/server/services/common";
import { faDigits, formatDateTime } from "@/lib/format";
import { DownloadLink, EmptyState, Icon, InquiryStatusBadge, Ltr, Pagination } from "@/components/ui";

export const metadata = { title: "درخواست‌ها" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Inquiries({ searchParams }: { searchParams: SP }) {
  const user = await requirePage("inquiries.view");
  const params = await searchParams;
  const db = await getDb();
  const [res, staff] = await Promise.all([listInquiries(db, user, params), staffOptions(db)]);
  const f = res.filters;
  return (
    <>
      <div className="page-header">
        <h1>درخواست‌ها</h1>
        <div className="row">
          {user.permissions.has("export.data") && <DownloadLink href="/api/admin/export/inquiries"><Icon name="download" size={16} />CSV</DownloadLink>}
          {user.permissions.has("inquiries.manage") && <Link className="btn btn-primary" href="/admin/inquiries/new"><Icon name="plus" size={18} />ثبت درخواست تلفنی/حضوری</Link>}
        </div>
      </div>
      <form method="get" className="toolbar" role="search">
        <div className="field"><label htmlFor="q">جست‌وجو</label><input id="q" name="q" className="input" defaultValue={f.q} placeholder="نام، شماره یا متن" /></div>
        <div className="field"><label htmlFor="status">وضعیت</label>
          <select id="status" name="status" className="select" defaultValue={f.status ?? ""}><option value="">همه</option>{Object.entries(INQUIRY_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="agent">مسئول</label>
          <select id="agent" name="agent" className="select" defaultValue={f.agent ?? ""}><option value="">همه</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <label className="check"><input type="checkbox" name="open" value="1" defaultChecked={!!f.open} />فقط باز</label>
        <button className="btn btn-navy" type="submit">اعمال</button>
        <Link className="btn btn-ghost" href="/admin/inquiries">پاک کردن</Link>
      </form>
      <p className="muted small" role="status">{faDigits(res.total)} مورد</p>
      {res.rows.length === 0 ? <EmptyState title="درخواستی نیست">درخواست‌های فرم سایت و تماس‌های ثبت‌شده اینجا نمایش داده می‌شوند.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">فهرست درخواست‌ها</caption>
            <thead><tr><th scope="col">نام</th><th scope="col">تماس</th><th scope="col">ملک</th><th scope="col">منبع</th><th scope="col">وضعیت</th><th scope="col">مسئول</th><th scope="col">زمان</th></tr></thead>
            <tbody>
              {res.rows.map(({ i, propertyRef, propertyTitle, agentName }) => (
                <tr key={i.id}>
                  <td><Link href={`/admin/inquiries/${i.id}`}>{i.name}</Link></td>
                  <td className="num"><Ltr>{i.phone}</Ltr></td>
                  <td>{propertyRef ? <span title={propertyTitle ?? ""}><Ltr>{propertyRef}</Ltr></span> : <span className="muted">عمومی</span>}</td>
                  <td className="small">{INQUIRY_SOURCES[i.source as keyof typeof INQUIRY_SOURCES] ?? i.source}</td>
                  <td><InquiryStatusBadge status={i.status} /></td>
                  <td>{agentName ?? <span className="muted">—</span>}</td>
                  <td className="num small">{formatDateTime(i.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={PAGE_SIZE} basePath="/admin/inquiries" params={params} />
    </>
  );
}
