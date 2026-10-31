import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { dashboardStats } from "@/server/services/admin";
import { financeReport, commissionReceivables } from "@/server/services/deals";
import { upcomingFollowups } from "@/server/services/crm";
import { getSettings } from "@/server/services/settings";
import { currentJalaliYear, formatDate, formatDateTime, formatNumber, jalaliMonthRange, jalaliOf, todayIso, JALALI_MONTHS } from "@/lib/format";
import { InquiryStatusBadge, Money, PropertyStatusBadge, EmptyState, Icon } from "@/components/ui";
import { ROLES } from "@/server/auth/permissions";

export const metadata = { title: "داشبورد" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requirePage("dashboard.view");
  const db = await getDb();
  const st = await getSettings();
  const d = await dashboardStats(db, user);
  const today = jalaliOf(todayIso());
  const sp = await searchParams;
  const [qy, qm] = (sp.m ?? `${today.jy}-${today.jm}`).split("-").map(Number);
  const jy = qy >= 1390 && qy <= 1500 ? qy : today.jy;
  const jm = qm >= 1 && qm <= 12 ? qm : today.jm;
  const [from, to] = jalaliMonthRange(jy, jm);
  const fin = user.permissions.has("reports.finance") ? await financeReport(db, user, from, to) : null;
  const rec = user.permissions.has("reports.finance") ? await commissionReceivables(db, user) : null;
  const fups = user.permissions.has("followups.manage") ? await upcomingFollowups(db, user) : [];
  const now = Date.now();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <>
      <div className="welcome">
        <div className="stack" style={{ gap: 4 }}>
          <h1>داشبورد</h1>
          <p>سلام {user.name}، خوش آمدید · {ROLES[user.role]}</p>
        </div>
        <div className="row">
          <span className="date">امروز {formatDate(new Date())}</span>
          {user.permissions.has("properties.edit") && <Link className="btn btn-primary btn-sm" href="/admin/properties/new"><Icon name="plus" size={16} />ثبت ملک</Link>}
        </div>
      </div>

      <section aria-labelledby="h-props" className="stack" style={{ gap: 10 }}>
        <h2 id="h-props" className="sec-title">املاک</h2>
        <div className="stats">
          <Link className="stat" href="/admin/properties"><span className="s-ic"><Icon name="home" size={20} /></span><span className="label">کل املاک (بدون بایگانی)</span><span className="value">{formatNumber(d.properties.total)}</span></Link>
          <Link className="stat accent" href="/admin/properties?status=published"><span className="s-ic"><Icon name="check" size={20} /></span><span className="label">منتشرشده</span><span className="value">{formatNumber(d.properties.published)}</span></Link>
          <Link className="stat" href="/admin/properties?status=draft"><span className="s-ic"><Icon name="doc" size={20} /></span><span className="label">پیش‌نویس</span><span className="value">{formatNumber(d.properties.draft)}</span></Link>
          <Link className="stat" href="/admin/properties?status=pending_review"><span className="s-ic"><Icon name="clock" size={20} /></span><span className="label">در انتظار بررسی</span><span className="value">{formatNumber(d.properties.pending)}</span></Link>
          <Link className="stat" href="/admin/properties?status=sold"><span className="s-ic"><Icon name="key" size={20} /></span><span className="label">فروخته‌شده</span><span className="value">{formatNumber(d.properties.sold)}</span></Link>
          <Link className="stat" href="/admin/properties?status=rented"><span className="s-ic"><Icon name="calendarCheck" size={20} /></span><span className="label">اجاره‌رفته</span><span className="value">{formatNumber(d.properties.rented)}</span></Link>
        </div>
      </section>

      {user.permissions.has("inquiries.view") && (
        <section aria-labelledby="h-inq" className="stack" style={{ gap: 10 }}>
          <h2 id="h-inq" className="sec-title">درخواست‌ها</h2>
          <div className="stats">
            <Link className="stat accent" href="/admin/inquiries?status=new"><span className="s-ic"><Icon name="inbox" size={20} /></span><span className="label">جدید (بررسی‌نشده)</span><span className="value">{formatNumber(d.inquiries.fresh)}</span></Link>
            <Link className="stat" href="/admin/inquiries?open=1"><span className="s-ic"><Icon name="users" size={20} /></span><span className="label">باز (در جریان)</span><span className="value">{formatNumber(d.inquiries.open)}</span></Link>
            <div className="stat"><span className="s-ic"><Icon name="calendar" size={20} /></span><span className="label">۳۰ روز اخیر</span><span className="value">{formatNumber(d.inquiries.last30)}</span></div>
          </div>
        </section>
      )}

      {fin && (
        <section aria-labelledby="h-fin" className="stack" style={{ gap: 10 }}>
          <div className="row between">
            <h2 id="h-fin" className="sec-title">مالی — {JALALI_MONTHS[jm - 1]} {formatNumber(jy).replace(/٬/g, "")}</h2>
            <form method="get" className="row" style={{ gap: 6 }}>
              <label className="sr-only" htmlFor="m">ماه</label>
              <select id="m" name="m" className="select" style={{ width: "auto", minHeight: 36, padding: "4px 8px" }} defaultValue={`${jy}-${jm}`}>
                {[currentJalaliYear(), currentJalaliYear() - 1].flatMap((y) => months.map((m) => <option key={`${y}-${m}`} value={`${y}-${m}`}>{JALALI_MONTHS[m - 1]} {formatNumber(y).replace(/٬/g, "")}</option>))}
              </select>
              <button className="btn btn-outline btn-sm" type="submit">نمایش</button>
            </form>
          </div>
          <div className="stats">
            <Link className="stat" href={`/admin/finance?kind=income`}><span className="s-ic"><Icon name="wallet" size={20} /></span><span className="label">دریافت‌های ثبت‌شده</span><span className="value" ><Money value={fin.income} display={st.currency.display} /></span></Link>
            <Link className="stat" href={`/admin/finance?kind=expense`}><span className="s-ic"><Icon name="layers" size={20} /></span><span className="label">هزینه‌های ثبت‌شده</span><span className="value" ><Money value={fin.expense} display={st.currency.display} /></span></Link>
            <div className="stat dark"><span className="s-ic"><Icon name="chart" size={20} /></span><span className="label">خالص ثبت‌شده (دریافت − هزینه)</span><span className="value" ><Money value={fin.net} display={st.currency.display} /></span></div>
            {rec && <Link className="stat" href="/admin/reports?tab=finance"><span className="s-ic"><Icon name="handshake" size={20} /></span><span className="label">کمیسیون دریافت‌نشده (کل)</span><span className="value" ><Money value={rec.totalOutstanding} display={st.currency.display} /></span></Link>}
          </div>
          <p className="tiny muted">ارقام فقط از ثبت‌های مالی همین سامانه محاسبه می‌شوند و سود حسابرسی‌شده نیستند. ارزش معاملهٔ ملک جزو دریافت دفتر حساب نمی‌شود.</p>
        </section>
      )}

      <div className="two-col">
        <div className="main">
          <section className="panel stack" aria-labelledby="h-recent">
            <h2 id="h-recent" style={{ fontSize: 18 }}>آخرین تغییرات املاک</h2>
            {d.recentProps.length === 0 ? <EmptyState title="هنوز ملکی ثبت نشده است" action={user.permissions.has("properties.edit") ? <Link className="btn btn-primary" href="/admin/properties/new">ثبت اولین ملک</Link> : undefined} /> : (
              <ul className="timeline">
                {d.recentProps.map((p) => (
                  <li key={p.id} className="row between"><Link href={`/admin/properties/${p.id}`}>{p.title}</Link><span className="row" style={{ gap: 8 }}><PropertyStatusBadge status={p.status} /><span className="tiny muted">{formatDateTime(p.updatedAt)}</span></span></li>
                ))}
              </ul>
            )}
          </section>
          {d.recentInquiries.length > 0 && (
            <section className="panel stack" aria-labelledby="h-ri">
              <h2 id="h-ri" style={{ fontSize: 18 }}>آخرین درخواست‌ها</h2>
              <ul className="timeline">
                {d.recentInquiries.map((i) => (
                  <li key={i.id} className="row between"><Link href={`/admin/inquiries/${i.id}`}>{i.name}</Link><span className="row" style={{ gap: 8 }}><InquiryStatusBadge status={i.status} /><span className="tiny muted">{formatDateTime(i.createdAt)}</span></span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {user.permissions.has("followups.manage") && (
          <aside>
            <section className="panel stack" aria-labelledby="h-fu">
              <div className="row between"><h2 id="h-fu" style={{ fontSize: 18 }}>پیگیری‌های پیش رو</h2><Link className="small" href="/admin/followups">همه</Link></div>
              {fups.length === 0 ? <p className="muted small">پیگیری بازی برای ۷ روز آینده نیست.</p> : (
                <ul className="timeline">
                  {fups.map(({ f, contactName }) => (
                    <li key={f.id}>
                      <strong>{f.purpose}</strong>
                      <span className="tiny" style={{ color: f.dueAt.getTime() < now ? "var(--error)" : "var(--text-muted)" }}>{f.dueAt.getTime() < now ? "عقب‌افتاده · " : ""}{formatDateTime(f.dueAt)}{contactName ? ` · ${contactName}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
