import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { listTransactions } from "@/server/services/deals";
import { PAGE_SIZE } from "@/server/services/common";
import { TX_KINDS, TX_STATUSES } from "@/lib/vocab";
import { faDigits, formatDate } from "@/lib/format";
import { DownloadLink, EmptyState, Icon, Ltr, Money, PaymentBadge, Pagination, TxStatusBadge } from "@/components/ui";

export const metadata = { title: "معاملات" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Transactions({ searchParams }: { searchParams: SP }) {
  const user = await requirePage("transactions.view");
  const params = await searchParams;
  const db = await getDb();
  const res = await listTransactions(db, user, params);
  const f = res.filters;
  const showFinance = user.permissions.has("finance.view");
  return (
    <>
      <div className="page-header">
        <h1>معاملات</h1>
        <div className="row">
          {user.permissions.has("export.data") && <DownloadLink href="/api/admin/export/transactions"><Icon name="download" size={16} />CSV</DownloadLink>}
          {user.permissions.has("transactions.manage") && <Link className="btn btn-primary" href="/admin/transactions/new"><Icon name="plus" size={18} />معاملهٔ جدید</Link>}
        </div>
      </div>
      <form method="get" className="toolbar" role="search">
        <div className="field"><label htmlFor="q">جست‌وجو</label><input id="q" name="q" className="input" defaultValue={f.q} placeholder="کد معامله یا ملک" /></div>
        <div className="field"><label htmlFor="status">وضعیت</label>
          <select id="status" name="status" className="select" defaultValue={f.status ?? ""}><option value="">همه</option>{Object.entries(TX_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="kind">نوع</label>
          <select id="kind" name="kind" className="select" defaultValue={f.kind ?? ""}><option value="">همه</option>{Object.entries(TX_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="btn btn-navy" type="submit">اعمال</button>
        <Link className="btn btn-ghost" href="/admin/transactions">پاک کردن</Link>
      </form>
      <p className="muted small" role="status">{faDigits(res.total)} معامله</p>
      {res.rows.length === 0 ? <EmptyState title="معامله‌ای ثبت نشده است">بعد از توافق طرفین، معامله را اینجا ثبت کنید تا کمیسیون آن پیگیری شود.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">فهرست معاملات</caption>
            <thead><tr>
              <th scope="col">کد</th><th scope="col">نوع</th><th scope="col">ملک</th><th scope="col">ارزش معامله</th><th scope="col">کمیسیون مورد انتظار</th>
              {showFinance && <th scope="col">دریافت‌شده</th>}<th scope="col">وضعیت</th><th scope="col">تاریخ</th>
            </tr></thead>
            <tbody>
              {res.rows.map(({ t, propertyRef, propertyTitle, received, payment }) => (
                <tr key={t.id}>
                  <td><Link href={`/admin/transactions/${t.id}`}><Ltr>{t.code}</Ltr></Link></td>
                  <td>{TX_KINDS[t.kind as keyof typeof TX_KINDS]}</td>
                  <td className="small">{propertyRef ? <span title={propertyTitle ?? ""}><Ltr>{propertyRef}</Ltr></span> : "—"}</td>
                  <td className="num"><Money value={t.dealAmount} /></td>
                  <td className="num"><Money value={t.expectedCommission} /></td>
                  {showFinance && <td className="num"><Money value={received} /> {payment && <PaymentBadge state={payment} />}</td>}
                  <td><TxStatusBadge status={t.status} /></td>
                  <td className="num small">{t.transactionDate ? formatDate(t.transactionDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={PAGE_SIZE} basePath="/admin/transactions" params={params} />
    </>
  );
}
