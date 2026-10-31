import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import { getInquiry } from "@/server/services/crm";
import { staffOptions } from "@/server/services/admin";
import { ServiceError } from "@/server/services/common";
import { INQUIRY_SOURCES, INQUIRY_STATUSES } from "@/lib/vocab";
import { formatDateTime, isoDateToJalaliLatin, todayIso, whatsappLink } from "@/lib/format";
import { Breadcrumbs, InquiryStatusBadge, Ltr } from "@/components/ui";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import {
  inquiryAssignAction, inquiryFollowupAction, inquiryLinkContactAction, inquiryLinkTxAction, inquiryNoteAction, inquiryStatusAction,
} from "../actions";

export const metadata = { title: "جزئیات درخواست" };

export default async function InquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("inquiries.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  let d;
  try { d = await getInquiry(db, user, id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const staff = await staffOptions(db);
  const canManage = user.permissions.has("inquiries.manage");
  const txs = canManage && user.permissions.has("transactions.view")
    ? await db.select({ id: s.transactions.id, code: s.transactions.code }).from(s.transactions).where(sql`${s.transactions.status} <> 'cancelled'`).orderBy(desc(s.transactions.createdAt)).limit(100)
    : [];
  const i = d.i;
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/inquiries", label: "درخواست‌ها" }, { label: i.name }]} />
      <div className="page-header">
        <div className="stack" style={{ gap: 4 }}>
          <h1>{i.name}</h1>
          <span className="row small muted" style={{ gap: 8 }}><InquiryStatusBadge status={i.status} />{INQUIRY_SOURCES[i.source as keyof typeof INQUIRY_SOURCES]} · {formatDateTime(i.createdAt)}</span>
        </div>
        <div className="row">
          <a className="btn btn-navy btn-sm" href={`tel:${i.phone}`}>تماس <Ltr>{i.phone}</Ltr></a>
          <a className="btn btn-outline btn-sm" href={whatsappLink(i.phone)} target="_blank" rel="noopener">واتساپ</a>
        </div>
      </div>
      <div className="two-col">
        <div className="main">
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>درخواست</h2>
            <dl className="kv">
              <div><dt>ملک</dt><dd>{d.propertyRef ? <Link href={`/admin/properties/${d.propertyId}`}><Ltr>{d.propertyRef}</Ltr> — {d.propertyTitle}</Link> : "عمومی (بدون ملک)"}</dd></div>
              <div><dt>زمان مناسب تماس</dt><dd>{i.preferredTime ?? "—"}</dd></div>
            </dl>
            <p style={{ whiteSpace: "pre-line" }}>{i.message ?? <span className="muted">پیامی ننوشته است.</span>}</p>
          </section>

          {canManage && (
            <section className="panel stack" aria-labelledby="h-note">
              <h2 id="h-note" style={{ fontSize: 18 }}>ثبت تماس یا یادداشت</h2>
              <ActionForm action={inquiryNoteAction} className="stack" resetOnSuccess>
                <input type="hidden" name="id" value={i.id} />
                <TextAreaField label="متن" name="body" required maxLength={2000} style={{ minHeight: 90 }} />
                <div className="row">
                  <SubmitButton name="kind" value="call" className="btn btn-navy">ثبت تماس</SubmitButton>
                  <SubmitButton name="kind" value="note" className="btn btn-outline">ثبت یادداشت</SubmitButton>
                </div>
              </ActionForm>
            </section>
          )}

          <section className="panel stack" aria-labelledby="h-act">
            <h2 id="h-act" style={{ fontSize: 18 }}>سابقه</h2>
            <ul className="timeline">
              {d.activities.map(({ a, by }) => (
                <li key={a.id}><span style={{ whiteSpace: "pre-line" }}>{a.body}</span><span className="tiny muted">{formatDateTime(a.createdAt)}{by ? ` · ${by}` : ""}</span></li>
              ))}
            </ul>
          </section>
        </div>

        <aside>
          {canManage && (
            <section className="panel stack" style={{ borderTop: "6px solid var(--amber)" }}>
              <h2 style={{ fontSize: 18 }}>وضعیت و مسئول</h2>
              <ActionForm action={inquiryStatusAction} className="stack">
                <input type="hidden" name="id" value={i.id} />
                <SelectField label="وضعیت" name="status" defaultValue={i.status}>
                  {Object.entries(INQUIRY_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectField>
                <TextField label="توضیح (اختیاری)" name="note" maxLength={200} />
                <SubmitButton className="btn btn-navy">ثبت وضعیت</SubmitButton>
              </ActionForm>
              <ActionForm action={inquiryAssignAction} className="stack">
                <input type="hidden" name="id" value={i.id} />
                <SelectField label="مسئول پیگیری" name="agentId" defaultValue={i.agentId ?? ""}>
                  <option value="">— بدون مسئول —</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </SelectField>
                <SubmitButton className="btn btn-outline">واگذاری</SubmitButton>
              </ActionForm>
            </section>
          )}

          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>مخاطب</h2>
            {d.contact ? (
              <p><Link href={`/admin/contacts/${d.contact.id}`}>{d.contact.fullName}</Link> · <Ltr>{d.contact.phone}</Ltr></p>
            ) : canManage ? (
              <>
                {d.matches.length > 0 && (
                  <ActionForm action={inquiryLinkContactAction} className="stack">
                    <input type="hidden" name="id" value={i.id} />
                    <SelectField label="مخاطب با همین شماره پیدا شد" name="contactId">
                      {d.matches.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                    </SelectField>
                    <SubmitButton name="mode" value="link" className="btn btn-outline">اتصال به این مخاطب</SubmitButton>
                  </ActionForm>
                )}
                {user.permissions.has("contacts.manage") && (
                  <ActionForm action={inquiryLinkContactAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <SubmitButton name="mode" value="create" className="btn btn-primary">ساخت مخاطب جدید از این درخواست</SubmitButton>
                  </ActionForm>
                )}
              </>
            ) : <p className="muted small">متصل نشده است.</p>}
          </section>

          {user.permissions.has("followups.manage") && (
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>پیگیری</h2>
              {d.followups.length > 0 && (
                <ul className="timeline">
                  {d.followups.map((f) => <li key={f.id}><span>{f.done ? "✓ " : ""}{f.purpose}</span><span className="tiny muted">{formatDateTime(f.dueAt)}</span></li>)}
                </ul>
              )}
              <ActionForm action={inquiryFollowupAction} className="stack" resetOnSuccess>
                <input type="hidden" name="inquiryId" value={i.id} />
                {d.contact && <input type="hidden" name="contactId" value={d.contact.id} />}
                {d.propertyId && <input type="hidden" name="propertyId" value={d.propertyId} />}
                <TextField label="موضوع" name="purpose" required maxLength={200} placeholder="مثلاً هماهنگی بازدید" />
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <TextField label="تاریخ" name="date" required defaultValue={isoDateToJalaliLatin(todayIso())} dir="ltr" />
                  <TextField label="ساعت" name="time" defaultValue="10:00" dir="ltr" />
                </div>
                <SelectField label="انجام‌دهنده" name="assignedTo" defaultValue={i.agentId ?? user.id}>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </SelectField>
                <SubmitButton className="btn btn-outline">ثبت پیگیری</SubmitButton>
              </ActionForm>
            </section>
          )}

          {txs.length > 0 && !i.transactionId && (
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>اتصال به معامله</h2>
              <ActionForm action={inquiryLinkTxAction} className="stack">
                <input type="hidden" name="id" value={i.id} />
                <SelectField label="معامله" name="transactionId">{txs.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}</SelectField>
                <SubmitButton className="btn btn-outline">اتصال (وضعیت: به معامله رسید)</SubmitButton>
              </ActionForm>
            </section>
          )}
          {i.transactionId && <p className="small">متصل به <Link href={`/admin/transactions/${i.transactionId}`}>معاملهٔ مربوط</Link></p>}
        </aside>
      </div>
    </>
  );
}
