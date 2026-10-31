import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { listContacts } from "@/server/services/crm";
import { PAGE_SIZE } from "@/server/services/common";
import { CONTACT_STATUSES, CONTACT_TYPES } from "@/lib/vocab";
import { faDigits, formatDate } from "@/lib/format";
import { DownloadLink, Badge, EmptyState, Icon, Ltr, Pagination } from "@/components/ui";

export const metadata = { title: "مخاطبان" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Contacts({ searchParams }: { searchParams: SP }) {
  const user = await requirePage("contacts.view");
  const params = await searchParams;
  const db = await getDb();
  const res = await listContacts(db, user, params);
  const f = res.filters;
  return (
    <>
      <div className="page-header">
        <h1>مخاطبان</h1>
        <div className="row">
          {user.permissions.has("export.data") && <DownloadLink href="/api/admin/export/contacts"><Icon name="download" size={16} />CSV</DownloadLink>}
          {user.permissions.has("contacts.manage") && <Link className="btn btn-primary" href="/admin/contacts/new"><Icon name="plus" size={18} />مخاطب جدید</Link>}
        </div>
      </div>
      <form method="get" className="toolbar" role="search">
        <div className="field"><label htmlFor="q">جست‌وجو</label><input id="q" name="q" className="input" defaultValue={f.q} placeholder="نام یا شماره" /></div>
        <div className="field"><label htmlFor="type">نوع</label>
          <select id="type" name="type" className="select" defaultValue={f.type ?? ""}><option value="">همه</option>{Object.entries(CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="status">وضعیت</label>
          <select id="status" name="status" className="select" defaultValue={f.status ?? ""}><option value="">فعال و غیرفعال</option>{Object.entries(CONTACT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="btn btn-navy" type="submit">اعمال</button>
        <Link className="btn btn-ghost" href="/admin/contacts">پاک کردن</Link>
      </form>
      <p className="muted small" role="status">{faDigits(res.total)} مخاطب</p>
      {res.rows.length === 0 ? <EmptyState title="مخاطبی پیدا نشد">مخاطبان را دستی اضافه کنید یا از صفحهٔ یک درخواست بسازید.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">فهرست مخاطبان</caption>
            <thead><tr><th scope="col">نام</th><th scope="col">تماس</th><th scope="col">نوع</th><th scope="col">مسئول</th><th scope="col">وضعیت</th><th scope="col">به‌روزرسانی</th></tr></thead>
            <tbody>
              {res.rows.map(({ c, agentName }) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/contacts/${c.id}`}>{c.fullName}</Link></td>
                  <td className="num"><Ltr>{c.phone}</Ltr></td>
                  <td className="small">{c.types.map((t) => CONTACT_TYPES[t as keyof typeof CONTACT_TYPES] ?? t).join("، ")}</td>
                  <td>{agentName ?? <span className="muted">—</span>}</td>
                  <td><Badge tone={c.status === "active" ? "success" : "muted"}>{CONTACT_STATUSES[c.status as keyof typeof CONTACT_STATUSES]}</Badge></td>
                  <td className="num small">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={PAGE_SIZE} basePath="/admin/contacts" params={params} />
    </>
  );
}
