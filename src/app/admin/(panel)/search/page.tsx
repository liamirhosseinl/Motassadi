import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { globalSearch, GLOBAL_SEARCH_PREVIEW } from "@/server/services/search";
import { faDigits, formatDate } from "@/lib/format";
import { DEAL_TYPES, TX_STATUSES } from "@/lib/vocab";
import { Badge, EmptyState, InquiryStatusBadge, Ltr, Money, PropertyStatusBadge } from "@/components/ui";

export const metadata = { title: "جست‌وجوی سراسری" };
type SP = Promise<Record<string, string | string[] | undefined>>;

function Section({ title, total, href, q, children }: { title: string; total: number; href: string; q: string; children: React.ReactNode }) {
  if (total === 0) return null;
  return (
    <section className="panel stack" aria-labelledby={`h-${href}`} style={{ gap: 12 }}>
      <div className="row between">
        <h2 id={`h-${href}`} style={{ fontSize: 20 }}>{title} <span className="muted small">({faDigits(total)})</span></h2>
        {total > GLOBAL_SEARCH_PREVIEW && <Link className="small" href={`${href}?q=${encodeURIComponent(q)}`}>نمایش همهٔ {faDigits(total)} نتیجه</Link>}
      </div>
      <ul className="timeline">{children}</ul>
    </section>
  );
}

export default async function GlobalSearch({ searchParams }: { searchParams: SP }) {
  const user = await requirePage("dashboard.view");
  const sp = await searchParams;
  const db = await getDb();
  const res = await globalSearch(db, user, Array.isArray(sp.q) ? sp.q[0] : sp.q);
  const sec = res.sections;
  const totalHits = sec ? Object.values(sec).reduce((n, x) => n + (x?.total ?? 0), 0) : 0;
  const NAMES = { properties: "املاک", contacts: "مخاطبان", inquiries: "درخواست‌ها", transactions: "معاملات", finance: "دریافت و هزینه" } as const;
  const emptyNames = sec ? (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter((k) => sec[k] && sec[k]!.total === 0).map((k) => NAMES[k]) : [];
  return (
    <>
      <div className="page-header"><h1>جست‌وجوی سراسری</h1></div>
      <form method="get" className="toolbar" role="search">
        <div className="field" style={{ flex: "999 1 320px" }}>
          <label htmlFor="gq">عبارت جست‌وجو</label>
          <input id="gq" name="q" className="input" defaultValue={res.q} placeholder="کد ملک، عنوان، نام، شماره تلفن، کد معامله، شمارهٔ مرجع" autoFocus minLength={2} maxLength={100} />
        </div>
        <button className="btn btn-navy" type="submit">جست‌وجو</button>
      </form>
      {!sec ? (
        <p className="muted">دست‌کم دو نویسه بنویسید. جست‌وجو در بخش‌هایی انجام می‌شود که به آن‌ها دسترسی دارید.</p>
      ) : (
        <>
          <p className="muted small" role="status">{faDigits(totalHits)} نتیجه برای «{res.q}»</p>
          {totalHits > 0 && emptyNames.length > 0 && <p className="tiny muted">بدون نتیجه در: {emptyNames.join("، ")}</p>}
          {totalHits === 0 && <EmptyState title="نتیجه‌ای پیدا نشد">املایی دیگر، بخشی از شماره یا کد کامل را امتحان کنید.</EmptyState>}
          <div className="stack">
            {sec.properties && (
              <Section title="املاک" total={sec.properties.total} href="/admin/properties" q={res.q}>
                {sec.properties.rows.map(({ p, categoryName }) => (
                  <li key={p.id}>
                    <span className="row" style={{ gap: 8 }}><Link href={`/admin/properties/${p.id}`}>{p.title}</Link><PropertyStatusBadge status={p.status} /></span>
                    <span className="tiny muted"><Ltr>{p.ref}</Ltr> · {categoryName} · {DEAL_TYPES[p.dealType as keyof typeof DEAL_TYPES]}{p.neighborhood ? ` · ${p.neighborhood}` : ""}</span>
                  </li>
                ))}
              </Section>
            )}
            {sec.contacts && (
              <Section title="مخاطبان" total={sec.contacts.total} href="/admin/contacts" q={res.q}>
                {sec.contacts.rows.map(({ c }) => (
                  <li key={c.id}>
                    <Link href={`/admin/contacts/${c.id}`}>{c.fullName}</Link>
                    <span className="tiny muted"><Ltr>{c.phone}</Ltr></span>
                  </li>
                ))}
              </Section>
            )}
            {sec.inquiries && (
              <Section title="درخواست‌ها" total={sec.inquiries.total} href="/admin/inquiries" q={res.q}>
                {sec.inquiries.rows.map(({ i, propertyRef }) => (
                  <li key={i.id}>
                    <span className="row" style={{ gap: 8 }}><Link href={`/admin/inquiries/${i.id}`}>{i.name}</Link><InquiryStatusBadge status={i.status} /></span>
                    <span className="tiny muted"><Ltr>{i.phone}</Ltr>{propertyRef ? <> · ملک <Ltr>{propertyRef}</Ltr></> : null} · {formatDate(i.createdAt)}</span>
                  </li>
                ))}
              </Section>
            )}
            {sec.transactions && (
              <Section title="معاملات" total={sec.transactions.total} href="/admin/transactions" q={res.q}>
                {sec.transactions.rows.map(({ t, propertyTitle }) => (
                  <li key={t.id}>
                    <span className="row" style={{ gap: 8 }}><Link href={`/admin/transactions/${t.id}`}><Ltr>{t.code}</Ltr></Link><Badge tone={t.status === "completed" ? "success" : t.status === "cancelled" ? "muted" : "info"}>{TX_STATUSES[t.status as keyof typeof TX_STATUSES]}</Badge></span>
                    <span className="tiny muted">{propertyTitle ?? "بدون ملک"}</span>
                  </li>
                ))}
              </Section>
            )}
            {sec.finance && (
              <Section title="دریافت و هزینه" total={sec.finance.total} href="/admin/finance" q={res.q}>
                {sec.finance.rows.map(({ e, categoryName }) => (
                  <li key={e.id}>
                    <span className="row" style={{ gap: 8 }}>
                      <Link href={`/admin/finance?q=${encodeURIComponent(res.q)}&status=all`}>{e.kind === "income" ? "دریافت" : "هزینه"} — {categoryName}</Link>
                      <Money value={e.amount} />
                      {e.status === "void" && <Badge tone="muted">باطل</Badge>}
                    </span>
                    <span className="tiny muted">{formatDate(e.entryDate)}{e.referenceNo ? <> · مرجع <Ltr>{e.referenceNo}</Ltr></> : null}{e.description ? ` · ${e.description.slice(0, 60)}` : ""}</span>
                  </li>
                ))}
              </Section>
            )}
          </div>
        </>
      )}
    </>
  );
}
