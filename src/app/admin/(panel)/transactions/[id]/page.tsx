import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { getTransaction, paymentState } from "@/server/services/deals";
import { staffOptions } from "@/server/services/admin";
import { ServiceError } from "@/server/services/common";
import { PARTY_ROLES, PAYMENT_METHODS, TX_KINDS, TX_STATUSES } from "@/lib/vocab";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, Breadcrumbs, Icon, Ltr, Money, PaymentBadge, TxStatusBadge } from "@/components/ui";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import { TxForm } from "../form";
import { txFormOptions } from "../data";
import { txStatusAction, updateTxAction } from "../actions";

export const metadata = { title: "معامله" };

const ACTION_LABELS: Record<string, string> = {
  "transaction.create": "ثبت معامله", "transaction.update": "ویرایش", "transaction.status": "تغییر وضعیت", "transaction.reopen": "بازگشایی",
};

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("transactions.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  let d;
  try { d = await getTransaction(db, user, id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const t = d.t;
  const canManage = user.permissions.has("transactions.manage");
  const locked = t.status === "completed" || t.status === "cancelled";
  const editable = canManage && !locked;
  const [opts, staff] = editable ? await Promise.all([txFormOptions(db), staffOptions(db)]) : [null, []];
  const nextStatuses = locked
    ? (user.role === "owner" ? (["pending"] as const) : [])
    : (Object.keys(TX_STATUSES) as (keyof typeof TX_STATUSES)[]).filter((k) => k !== t.status);
  const outstanding = d.finance ? Math.max(t.expectedCommission - d.finance.received, 0) : null;
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/transactions", label: "معاملات" }, { label: t.code }]} />
      <div className="page-header">
        <div className="stack" style={{ gap: 4 }}>
          <h1><Ltr>{t.code}</Ltr> · {TX_KINDS[t.kind as keyof typeof TX_KINDS]}</h1>
          <span className="row small muted" style={{ gap: 8 }}>
            <TxStatusBadge status={t.status} />
            {d.propertyRef && <Link href={`/admin/properties/${t.propertyId}`}><Ltr>{d.propertyRef}</Ltr> — {d.propertyTitle}</Link>}
          </span>
        </div>
        {d.finance && user.permissions.has("finance.manage") && t.status !== "cancelled" && (
          <Link className="btn btn-primary" href={`/admin/finance/new?tx=${t.id}`}><Icon name="plus" size={18} />ثبت دریافت کمیسیون</Link>
        )}
      </div>

      <div className="stats">
        <div className="stat"><span className="label">ارزش معامله (درآمد دفتر نیست)</span><strong><Money value={t.dealAmount} /></strong></div>
        <div className="stat"><span className="label">کمیسیون مورد انتظار</span><strong><Money value={t.expectedCommission} /></strong>
          <span className="tiny muted">{t.commissionMode === "percent" && t.commissionRateBp != null ? `${(t.commissionRateBp / 100).toLocaleString("fa-IR")}٪ از ارزش معامله` : "مبلغ ثابت"}</span></div>
        {d.finance && <div className="stat"><span className="label">کمیسیون دریافت‌شده (خالص)</span><strong><Money value={d.finance.received} /></strong><PaymentBadge state={paymentState(t.expectedCommission, d.finance.received)} /></div>}
        {outstanding !== null && <div className="stat"><span className="label">مانده</span><strong><Money value={outstanding} /></strong></div>}
      </div>

      <div className="two-col">
        <div className="main">
          {editable && opts ? (
            <TxForm action={updateTxAction} t={t} parties={d.parties.map((p) => ({ contactId: p.c.id, role: p.role }))} properties={opts.properties} contacts={opts.contacts} staff={staff} />
          ) : (
            <section className="panel stack">
              {locked && <div className="alert alert-info">این معامله {TX_STATUSES[t.status as keyof typeof TX_STATUSES]} است و قابل ویرایش نیست.{user.role === "owner" ? " برای اصلاح، آن را بازگشایی کنید." : ""}</div>}
              <dl className="kv">
                <div><dt>تاریخ معامله</dt><dd>{t.transactionDate ? formatDate(t.transactionDate) : "—"}</dd></div>
                <div><dt>اجارهٔ ماهانه</dt><dd><Money value={t.monthlyRent} /></dd></div>
                <div><dt>طرفین</dt><dd>{d.parties.length ? d.parties.map((p) => `${p.c.fullName} (${PARTY_ROLES[p.role as keyof typeof PARTY_ROLES]})`).join("، ") : "—"}</dd></div>
              </dl>
              {t.notes && <p style={{ whiteSpace: "pre-line" }}>{t.notes}</p>}
            </section>
          )}

          {d.finance && (
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>ثبت‌های مالی این معامله</h2>
              {d.finance.entries.length === 0 ? <p className="muted small">هنوز چیزی ثبت نشده است.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th scope="col">تاریخ</th><th scope="col">نوع</th><th scope="col">دسته</th><th scope="col">مبلغ</th><th scope="col">روش</th><th scope="col">وضعیت</th></tr></thead>
                    <tbody>
                      {d.finance.entries.map((e) => (
                        <tr key={e.id} className={e.status === "void" ? "void-row" : undefined}>
                          <td className="num">{formatDate(e.entryDate)}</td>
                          <td>{e.kind === "income" ? "دریافت" : "پرداخت"}</td>
                          <td>{e.categoryName}</td>
                          <td className="num"><Money value={e.amount} /></td>
                          <td>{e.method ? PAYMENT_METHODS[e.method as keyof typeof PAYMENT_METHODS] : "—"}</td>
                          <td className="keep">{e.status === "void" ? <Badge tone="muted">باطل</Badge> : <Badge tone="success">ثبت‌شده</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <aside>
          {canManage && nextStatuses.length > 0 && (
            <section className="panel stack" style={{ borderTop: "6px solid var(--amber)" }}>
              <h2 style={{ fontSize: 18 }}>{locked ? "بازگشایی" : "تغییر وضعیت"}</h2>
              <ActionForm action={txStatusAction} className="stack">
                <input type="hidden" name="id" value={t.id} />
                <SelectField label="وضعیت جدید" name="to" required defaultValue="">
                  <option value="" disabled>انتخاب کنید</option>
                  {nextStatuses.map((k) => <option key={k} value={k}>{TX_STATUSES[k]}</option>)}
                </SelectField>
                <TextField label={locked ? "دلیل بازگشایی (الزامی)" : "دلیل (برای لغو الزامی است)"} name="reason" maxLength={300} />
                {!locked && t.propertyId && t.kind !== "other" && (
                  <label className="check small"><input type="checkbox" name="updateProperty" defaultChecked />در صورت تکمیل، وضعیت ملک «{t.kind === "sale" ? "فروخته‌شد" : "اجاره‌رفت"}» شود</label>
                )}
                <SubmitButton className="btn btn-navy">ثبت</SubmitButton>
              </ActionForm>
            </section>
          )}
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>سابقه</h2>
            <ul className="timeline">
              {d.history.map(({ a, by }) => {
                const m = (a.details ?? {}) as { from?: string; to?: string; reason?: string | null };
                return (
                  <li key={a.id}>
                    <span>{ACTION_LABELS[a.action] ?? a.action}{m.to ? `: ${TX_STATUSES[m.to as keyof typeof TX_STATUSES] ?? m.to}` : ""}{m.reason ? ` — ${m.reason}` : ""}</span>
                    <span className="tiny muted">{formatDateTime(a.createdAt)}{by ? ` · ${by}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
