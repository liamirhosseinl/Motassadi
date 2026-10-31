import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { getContact } from "@/server/services/crm";
import { activeCategories } from "@/server/services/properties";
import { staffOptions } from "@/server/services/admin";
import { ServiceError } from "@/server/services/common";
import { CONTACT_TYPES, PARTY_ROLES } from "@/lib/vocab";
import { formatDate, formatDateTime, whatsappLink } from "@/lib/format";
import { Breadcrumbs, InquiryStatusBadge, Ltr, Money, PropertyStatusBadge, TxStatusBadge } from "@/components/ui";
import { ContactForm } from "../form";
import { updateContactAction } from "../actions";

export const metadata = { title: "مخاطب" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("contacts.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  let d;
  try { d = await getContact(db, user, id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const c = d.contact;
  const canEdit = user.permissions.has("contacts.manage");
  const [categories, staff] = canEdit ? await Promise.all([activeCategories(db), staffOptions(db)]) : [[], []];
  return (
    <>
      <Breadcrumbs items={[{ href: "/admin/contacts", label: "مخاطبان" }, { label: c.fullName }]} />
      <div className="page-header">
        <div className="stack" style={{ gap: 4 }}>
          <h1>{c.fullName}</h1>
          <span className="small muted">{c.types.map((t) => CONTACT_TYPES[t as keyof typeof CONTACT_TYPES] ?? t).join("، ")} · ثبت {formatDate(c.createdAt)}</span>
        </div>
        <div className="row">
          <a className="btn btn-navy btn-sm" href={`tel:${c.phone}`}>تماس <Ltr>{c.phone}</Ltr></a>
          <a className="btn btn-outline btn-sm" href={whatsappLink(c.phone)} target="_blank" rel="noopener">واتساپ</a>
        </div>
      </div>
      <div className="two-col">
        <div className="main">
          {canEdit ? <ContactForm action={updateContactAction} c={c} categories={categories} staff={staff} /> : (
            <section className="panel stack">
              <dl className="kv">
                <div><dt>بودجه</dt><dd><Money value={c.budgetMin} /> تا <Money value={c.budgetMax} /></dd></div>
                <div><dt>محله‌ها</dt><dd>{c.preferredLocations ?? "—"}</dd></div>
              </dl>
              {c.requirements && <p style={{ whiteSpace: "pre-line" }}>{c.requirements}</p>}
              {c.notes && <p className="muted" style={{ whiteSpace: "pre-line" }}>{c.notes}</p>}
            </section>
          )}
        </div>
        <aside>
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>درخواست‌ها</h2>
            {d.inquiries.length === 0 ? <p className="muted small">ندارد.</p> : (
              <ul className="timeline">
                {d.inquiries.map(({ i, propertyRef }) => (
                  <li key={i.id}><Link href={`/admin/inquiries/${i.id}`}>{propertyRef ? <Ltr>{propertyRef}</Ltr> : "عمومی"}</Link> <InquiryStatusBadge status={i.status} /><span className="tiny muted">{formatDateTime(i.createdAt)}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>املاک این مالک</h2>
            {d.owned.length === 0 ? <p className="muted small">ندارد.</p> : (
              <ul className="timeline">
                {d.owned.map((p) => <li key={p.id}><Link href={`/admin/properties/${p.id}`}><Ltr>{p.ref}</Ltr> — {p.title}</Link> <PropertyStatusBadge status={p.status} /></li>)}
              </ul>
            )}
          </section>
          {user.permissions.has("transactions.view") && (
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>معاملات</h2>
              {d.transactions.length === 0 ? <p className="muted small">ندارد.</p> : (
                <ul className="timeline">
                  {d.transactions.map(({ t, role }) => <li key={`${t.id}-${role}`}><Link href={`/admin/transactions/${t.id}`}><Ltr>{t.code}</Ltr></Link> · {PARTY_ROLES[role as keyof typeof PARTY_ROLES]} <TxStatusBadge status={t.status} /></li>)}
                </ul>
              )}
            </section>
          )}
          <section className="panel stack">
            <h2 style={{ fontSize: 18 }}>پیگیری‌ها</h2>
            {d.followups.length === 0 ? <p className="muted small">ندارد.</p> : (
              <ul className="timeline">
                {d.followups.map((f) => <li key={f.id}><span>{f.done ? "✓ " : ""}{f.purpose}</span><span className="tiny muted">{formatDateTime(f.dueAt)}</span></li>)}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
