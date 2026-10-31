import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { financeCategoriesList, listFinance } from "@/server/services/deals";
import { PAGE_SIZE } from "@/server/services/common";
import { PAYMENT_METHODS } from "@/lib/vocab";
import { faDigits, formatDate } from "@/lib/format";
import { Badge, DownloadLink, EmptyState, Icon, Ltr, Money, Pagination } from "@/components/ui";
import { ActionForm, ConfirmSubmit, TextField } from "@/components/form";
import { voidFinanceAction } from "./actions";

export const metadata = { title: "مالی" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Finance({ searchParams }: { searchParams: SP }) {
  const user = await requirePage("finance.view");
  const params = await searchParams;
  const db = await getDb();
  const [res, cats] = await Promise.all([listFinance(db, user, params), financeCategoriesList(db, true)]);
  const f = res.filters;
  const canVoid = user.permissions.has("finance.void");
  const exportQs = new URLSearchParams(Object.entries(params).filter(([k, v]) => typeof v === "string" && k !== "page") as [string, string][]).toString();
  return (
    <>
      <div className="page-header">
        <h1>دریافت‌ها و هزینه‌ها</h1>
        <div className="row">
          {user.permissions.has("export.data") && <DownloadLink href={`/api/admin/export/finance${exportQs ? `?${exportQs}` : ""}`}><Icon name="download" size={16} />CSV همین فیلتر</DownloadLink>}
          {user.permissions.has("finance.manage") && <>
            <Link className="btn btn-outline" href="/admin/finance/new?kind=expense">ثبت هزینه</Link>
            <Link className="btn btn-primary" href="/admin/finance/new"><Icon name="plus" size={18} />ثبت دریافت</Link>
          </>}
        </div>
      </div>
      {params.created && <div className="alert alert-success" role="status" style={{ marginBottom: 12 }}>ثبت شد.</div>}
      {params.voided && <div className="alert alert-success" role="status" style={{ marginBottom: 12 }}>ثبت باطل شد. سابقهٔ آن حذف نمی‌شود و در فیلتر «باطل‌شده» دیده می‌شود.</div>}
      {params.duplicate && <div className="alert alert-warning" role="status" style={{ marginBottom: 12 }}>این فرم قبلاً ثبت شده بود؛ ثبت تکراری انجام نشد.</div>}
      <form method="get" className="toolbar" role="search">
        <div className="field"><label htmlFor="from">از تاریخ</label><input id="from" name="from" className="input" dir="ltr" placeholder="1405/01/01" defaultValue={f.from} style={{ width: 130 }} /></div>
        <div className="field"><label htmlFor="to">تا تاریخ</label><input id="to" name="to" className="input" dir="ltr" placeholder="1405/12/29" defaultValue={f.to} style={{ width: 130 }} /></div>
        <div className="field"><label htmlFor="kind">نوع</label>
          <select id="kind" name="kind" className="select" defaultValue={f.kind ?? ""}><option value="">همه</option><option value="income">دریافت</option><option value="expense">پرداخت</option></select></div>
        <div className="field"><label htmlFor="cat">دسته</label>
          <select id="cat" name="cat" className="select" defaultValue={f.cat ?? ""}><option value="">همه</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="status">وضعیت</label>
          <select id="status" name="status" className="select" defaultValue={f.status}><option value="recorded">ثبت‌شده</option><option value="void">باطل‌شده</option><option value="all">همه</option></select></div>
        <div className="field"><label htmlFor="q">شرح یا شماره</label><input id="q" name="q" className="input" defaultValue={f.q} /></div>
        <button className="btn btn-navy" type="submit">اعمال</button>
        <Link className="btn btn-ghost" href="/admin/finance">پاک کردن</Link>
      </form>
      <div className="totals" style={{ marginBottom: 16 }}>
        <div className="stat"><span className="label">جمع دریافت</span><strong><Money value={res.sums.income} /></strong></div>
        <div className="stat"><span className="label">جمع پرداخت</span><strong><Money value={res.sums.expense} /></strong></div>
        <div className="stat"><span className="label">خالص</span><strong><Money value={res.sums.income - res.sums.expense} /></strong></div>
      </div>
      <p className="muted small" role="status">جمع‌ها فقط از ثبت‌های معتبر (باطل‌نشده) با همین فیلتر محاسبه می‌شود. {faDigits(res.total)} ردیف.</p>
      {res.rows.length === 0 ? <EmptyState title="ثبتی نیست">دریافت کمیسیون و هزینه‌های دفتر اینجا ثبت می‌شود.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">ثبت‌های مالی</caption>
            <thead><tr><th scope="col">تاریخ</th><th scope="col">نوع</th><th scope="col">دسته</th><th scope="col">مبلغ</th><th scope="col">روش</th><th scope="col">معامله</th><th scope="col">شرح</th><th scope="col">ثبت‌کننده</th><th scope="col"><span className="sr-only">عملیات</span></th></tr></thead>
            <tbody>
              {res.rows.map(({ e, categoryName, txCode, by }) => (
                <tr key={e.id} className={e.status === "void" ? "void-row" : undefined}>
                  <td className="num">{formatDate(e.entryDate)}</td>
                  <td>{e.kind === "income" ? <Badge tone="success">دریافت</Badge> : <Badge tone="warning">پرداخت</Badge>}</td>
                  <td>{categoryName}</td>
                  <td className="num"><Money value={e.amount} /></td>
                  <td className="small">{e.method ? PAYMENT_METHODS[e.method as keyof typeof PAYMENT_METHODS] : "—"}{e.referenceNo && <div className="tiny"><Ltr>{e.referenceNo}</Ltr></div>}</td>
                  <td className="keep">{txCode ? <Link href={`/admin/transactions/${e.transactionId}`}><Ltr>{txCode}</Ltr></Link> : "—"}</td>
                  <td className="small">{e.description}{e.status === "void" && <div className="tiny">باطل: {e.voidReason}</div>}</td>
                  <td className="small">{by ?? "—"}</td>
                  <td className="keep">
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      {e.attachmentId && <a className="btn btn-ghost btn-sm" href={`/api/admin/attachments/${e.attachmentId}`}>رسید</a>}
                      {canVoid && e.status === "recorded" && (
                        <ActionForm action={voidFinanceAction} className="row" >
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="back" value={exportQs} />
                          <TextField label={<span className="sr-only">دلیل ابطال</span>} name="reason" placeholder="دلیل ابطال" maxLength={300} style={{ width: 140 }} />
                          <ConfirmSubmit title="ابطال این ثبت؟" body="ثبت حذف نمی‌شود؛ به حالت باطل می‌رود و از جمع‌ها خارج می‌شود. این کار در گزارش رویدادها ثبت می‌شود." confirmText="ابطال" className="btn btn-ghost btn-sm">ابطال</ConfirmSubmit>
                        </ActionForm>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={res.page} total={res.total} pageSize={PAGE_SIZE} basePath="/admin/finance" params={params} />
    </>
  );
}
