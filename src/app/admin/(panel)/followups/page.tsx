import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import { listFollowups } from "@/server/services/crm";
import { staffOptions } from "@/server/services/admin";
import { faDigits, formatDateTime, isoDateToJalaliLatin, todayIso } from "@/lib/format";
import { Badge, EmptyState, Ltr } from "@/components/ui";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { createFollowupAction, toggleFollowupAction } from "./actions";

export const metadata = { title: "پیگیری‌ها" };
const VIEWS = { mine: "مال من", open: "همهٔ باز", overdue: "عقب‌افتاده", done: "انجام‌شده" } as const;
type View = keyof typeof VIEWS;

export default async function Followups({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePage("followups.manage");
  const v = (await searchParams).view;
  const view: View = v && v in VIEWS ? (v as View) : "mine";
  const db = await getDb();
  const [rows, staff, contacts] = await Promise.all([
    listFollowups(db, user, view),
    staffOptions(db),
    db.select({ id: s.contacts.id, fullName: s.contacts.fullName }).from(s.contacts).where(sql`${s.contacts.status} = 'active'`).orderBy(asc(s.contacts.fullName)).limit(1000),
  ]);
  const now = Date.now();
  return (
    <>
      <div className="page-header"><h1>پیگیری‌ها</h1></div>
      <nav className="tabs" aria-label="نمای پیگیری‌ها">
        {Object.entries(VIEWS).map(([k, label]) => <Link key={k} href={`/admin/followups?view=${k}`} aria-current={view === k ? "page" : undefined} className={view === k ? "tab active" : "tab"}>{label}</Link>)}
      </nav>
      <div className="two-col">
        <div className="main">
          {rows.length === 0 ? <EmptyState title="موردی نیست">پیگیری‌ها را از صفحهٔ هر درخواست یا با فرم کنار صفحه ثبت کنید.</EmptyState> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{VIEWS[view]}</caption>
                <thead><tr><th scope="col">موضوع</th><th scope="col">زمان</th><th scope="col">مخاطب / ملک</th><th scope="col">انجام‌دهنده</th><th scope="col"><span className="sr-only">عملیات</span></th></tr></thead>
                <tbody>
                  {rows.map(({ f, contactName, propertyRef, assignee }) => {
                    const overdue = !f.done && f.dueAt.getTime() < now;
                    return (
                      <tr key={f.id}>
                        <td>
                          {f.inquiryId ? <Link href={`/admin/inquiries/${f.inquiryId}`}>{f.purpose}</Link> : f.purpose}
                          {f.notes && <div className="tiny muted">{f.notes}</div>}
                        </td>
                        <td className="num small">{formatDateTime(f.dueAt)} {overdue && <Badge tone="error">عقب‌افتاده</Badge>}</td>
                        <td className="small">{contactName ?? ""}{propertyRef ? <> · <Ltr>{propertyRef}</Ltr></> : null}</td>
                        <td className="small">{assignee ?? "—"}</td>
                        <td>
                          <ActionForm action={toggleFollowupAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <SubmitButton name="done" value={f.done ? "0" : "1"} className={f.done ? "btn btn-ghost btn-sm" : "btn btn-outline btn-sm"}>{f.done ? "بازگشایی" : "انجام شد"}</SubmitButton>
                          </ActionForm>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">{faDigits(rows.length)} مورد (حداکثر ۲۰۰ مورد نمایش داده می‌شود)</p>
        </div>
        <aside>
          <section className="panel stack" style={{ borderTop: "6px solid var(--amber)" }}>
            <h2 style={{ fontSize: 18 }}>پیگیری جدید</h2>
            <ActionForm action={createFollowupAction} className="stack" resetOnSuccess>
              <TextField label="موضوع" name="purpose" required maxLength={200} />
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <TextField label="تاریخ" name="date" required defaultValue={isoDateToJalaliLatin(todayIso())} dir="ltr" hint="۱۴۰۵/۰۸/۱۲" />
                <TextField label="ساعت" name="time" defaultValue="10:00" dir="ltr" />
              </div>
              <SelectField label="مخاطب" name="contactId"><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</SelectField>
              <SelectField label="انجام‌دهنده" name="assignedTo" defaultValue={user.id}>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectField>
              <TextAreaField label="توضیح" name="notes" maxLength={2000} style={{ minHeight: 70 }} />
              <SubmitButton>ثبت</SubmitButton>
            </ActionForm>
          </section>
        </aside>
      </div>
    </>
  );
}
