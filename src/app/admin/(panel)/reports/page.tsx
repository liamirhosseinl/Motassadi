import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { commissionReceivables, financeReport, monthlyFinance, operationsReport } from "@/server/services/deals";
import { DEAL_TYPES, INQUIRY_SOURCES, INQUIRY_STATUSES, PROPERTY_STATUSES, TX_KINDS, TX_STATUSES } from "@/lib/vocab";
import { faDigits, formatNumber, isoDateToJalali, isoDateToJalaliLatin, JALALI_MONTHS, jalaliMonthRange, jalaliOf, parseJalaliDate, todayIso } from "@/lib/format";
import { Ltr, Money } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "گزارش‌ها" };

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const tehranMidnight = (iso: string) => new Date(`${iso}T00:00:00+03:30`);

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("reports.view");
  const sp = await searchParams;
  const canFinance = user.permissions.has("reports.finance");
  const tab = sp.tab === "finance" && canFinance ? "finance" : "ops";
  const today = todayIso();
  const j = jalaliOf(today);
  const [monthStart] = jalaliMonthRange(j.jy, j.jm);
  const fromIso = parseJalaliDate(sp.from) || monthStart;
  const toIso = parseJalaliDate(sp.to) || today;
  const invalid = (sp.from && parseJalaliDate(sp.from) === undefined) || (sp.to && parseJalaliDate(sp.to) === undefined) || fromIso > toIso;
  const toExclusive = addDays(toIso, 1);
  const db = await getDb();
  const qs = (t: string) => `/admin/reports?tab=${t}&from=${isoDateToJalaliLatin(fromIso)}&to=${isoDateToJalaliLatin(toIso)}`;

  return (
    <>
      <div className="page-header">
        <div className="stack" style={{ gap: 4 }}>
          <h1>گزارش‌ها</h1>
          <span className="small muted">بازه: {isoDateToJalali(fromIso)} تا {isoDateToJalali(toIso)} (به وقت تهران)</span>
        </div>
        <PrintButton />
      </div>
      <nav className="tabs no-print" aria-label="نوع گزارش">
        <Link href={qs("ops")} className={tab === "ops" ? "tab active" : "tab"} aria-current={tab === "ops" ? "page" : undefined}>عملیات</Link>
        {canFinance && <Link href={qs("finance")} className={tab === "finance" ? "tab active" : "tab"} aria-current={tab === "finance" ? "page" : undefined}>مالی</Link>}
      </nav>
      <form method="get" className="toolbar no-print">
        <input type="hidden" name="tab" value={tab} />
        <div className="field"><label htmlFor="from">از</label><input id="from" name="from" className="input" dir="ltr" defaultValue={isoDateToJalaliLatin(fromIso)} style={{ width: 130 }} /></div>
        <div className="field"><label htmlFor="to">تا</label><input id="to" name="to" className="input" dir="ltr" defaultValue={isoDateToJalaliLatin(toIso)} style={{ width: 130 }} /></div>
        <button className="btn btn-navy" type="submit">نمایش</button>
        <Link className="btn btn-ghost" href={`/admin/reports?tab=${tab}&from=${j.jy}/01/01&to=${isoDateToJalaliLatin(today)}`}>از ابتدای سال</Link>
      </form>
      {invalid ? <div className="alert alert-error" role="alert">بازهٔ تاریخ نامعتبر است. قالب: 1405/08/01</div>
        : tab === "ops" ? <OpsReport fromIso={fromIso} toExclusive={toExclusive} user={user} />
        : <FinanceTab fromIso={fromIso} toExclusive={toExclusive} user={user} jy={j.jy} jm={j.jm} canExport={user.permissions.has("export.data")} fromJ={isoDateToJalaliLatin(fromIso)} toJ={isoDateToJalaliLatin(toIso)} />}
    </>
  );

  async function OpsReport({ fromIso, toExclusive, user }: { fromIso: string; toExclusive: string; user: Parameters<typeof operationsReport>[1] }) {
    const r = await operationsReport(db, user, tehranMidnight(fromIso), tehranMidnight(toExclusive));
    const active = r.inventory.filter((x) => x.status === "published" || x.status === "reserved").reduce((a, x) => a + x.n, 0);
    const byStatus = new Map<string, number>();
    r.inventory.forEach((x) => byStatus.set(x.status, (byStatus.get(x.status) ?? 0) + x.n));
    const byCat = new Map<string, number>();
    r.inventory.filter((x) => x.status === "published" || x.status === "reserved").forEach((x) => byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.n));
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div className="stats">
          <div className="stat"><span className="label">آگهی فعال (کل)</span><strong>{faDigits(active)}</strong></div>
          <div className="stat"><span className="label">درخواست در بازه</span><strong>{faDigits(r.conversion.total)}</strong></div>
          <div className="stat"><span className="label">به معامله رسید</span><strong>{faDigits(r.conversion.converted)}</strong>
            <span className="tiny muted">نرخ تبدیل {r.conversion.total ? `${formatNumber(Math.round(r.conversion.rate * 1000) / 10)}٪` : "—"}</span></div>
          <div className="stat"><span className="label">پیگیری‌های بازه</span><strong>{faDigits(r.followups.done)} از {faDigits(r.followups.total)}</strong><span className="tiny muted">عقب‌افتاده: {faDigits(r.followups.overdue)}</span></div>
        </div>
        <div className="two-col">
          <section className="panel stack main">
            <h2 style={{ fontSize: 18 }}>موجودی املاک بر اساس وضعیت (کل)</h2>
            <SimpleTable head={["وضعیت", "تعداد"]} rows={[...byStatus].map(([k, n]) => [PROPERTY_STATUSES[k as keyof typeof PROPERTY_STATUSES] ?? k, faDigits(n)])} />
            <h2 style={{ fontSize: 18 }}>آگهی‌های فعال بر اساس نوع ملک</h2>
            <SimpleTable head={["نوع", "تعداد"]} rows={[...byCat].map(([k, n]) => [k, faDigits(n)])} />
            <h2 style={{ fontSize: 18 }}>آگهی‌ها بر اساس نوع معامله</h2>
            <SimpleTable head={["نوع معامله", "وضعیت", "تعداد"]} rows={r.inventory.filter((x) => x.status !== "archived").map((x) => [DEAL_TYPES[x.deal as keyof typeof DEAL_TYPES] ?? x.deal, PROPERTY_STATUSES[x.status as keyof typeof PROPERTY_STATUSES] ?? x.status, faDigits(x.n)])} />
          </section>
          <aside className="stack">
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>درخواست‌ها بر اساس منبع</h2>
              <SimpleTable head={["منبع", "تعداد"]} rows={r.inqBySource.map((x) => [INQUIRY_SOURCES[x.source as keyof typeof INQUIRY_SOURCES] ?? x.source, faDigits(x.n)])} />
              <h2 style={{ fontSize: 18 }}>درخواست‌ها بر اساس وضعیت</h2>
              <SimpleTable head={["وضعیت", "تعداد"]} rows={r.inqByStatus.map((x) => [INQUIRY_STATUSES[x.status as keyof typeof INQUIRY_STATUSES] ?? x.status, faDigits(x.n)])} />
            </section>
          </aside>
        </div>
        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>بار کاری کارکنان (وضعیت فعلی)</h2>
          <SimpleTable head={["نام", "درخواست باز", "آگهی فعال", "پیگیری باز"]} rows={r.workload.map((w) => [w.name, faDigits(w.openInquiries), faDigits(w.activeListings), faDigits(w.openFollowups)])} />
        </section>
        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>معاملات بازه (بر اساس تاریخ معامله)</h2>
          <p className="small muted">ارزش معامله، ارزش ملک است و درآمد دفتر حساب نمی‌شود.</p>
          <SimpleTable head={["نوع", "وضعیت", "تعداد", "ارزش معامله", "کمیسیون مورد انتظار"]}
            rows={r.txSummary.map((t) => [TX_KINDS[t.kind as keyof typeof TX_KINDS], TX_STATUSES[t.status as keyof typeof TX_STATUSES], faDigits(t.n), <Money key="d" value={t.deal} />, <Money key="e" value={t.expected} />])} />
        </section>
      </div>
    );
  }

  async function FinanceTab({ fromIso, toExclusive, user, jy, jm, canExport, fromJ, toJ }: {
    fromIso: string; toExclusive: string; user: Parameters<typeof financeReport>[1]; jy: number; jm: number; canExport: boolean; fromJ: string; toJ: string;
  }) {
    const months: { label: string; from: string; to: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      let y = jy, m = jm - i;
      while (m < 1) { m += 12; y -= 1; }
      const [a, b] = jalaliMonthRange(y, m);
      months.push({ label: `${JALALI_MONTHS[m - 1]} ${faDigits(y)}`, from: a, to: b });
    }
    // Jalali-year summaries: every month of the current year, and whole-year totals for the last three years.
    const yearMonths = Array.from({ length: 12 }, (_, i) => {
      const [a, b] = jalaliMonthRange(jy, i + 1);
      return { label: JALALI_MONTHS[i], from: a, to: b };
    });
    const years = [jy - 2, jy - 1, jy].map((y) => ({ label: faDigits(y), from: jalaliMonthRange(y, 1)[0], to: jalaliMonthRange(y, 12)[1] }));
    const [r, recv, monthly, yearRows, yearly] = await Promise.all([
      financeReport(db, user, fromIso, toExclusive), commissionReceivables(db, user), monthlyFinance(db, user, months),
      monthlyFinance(db, user, yearMonths), monthlyFinance(db, user, years),
    ]);
    const yearTotal = yearRows.reduce((a, m) => ({ income: a.income + m.income, expense: a.expense + m.expense }), { income: 0, expense: 0 });
    const max = Math.max(1, ...monthly.flatMap((m) => [m.income, m.expense]));
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div className="stats">
          <div className="stat"><span className="label">جمع دریافت</span><strong><Money value={r.income} /></strong></div>
          <div className="stat"><span className="label">جمع هزینه</span><strong><Money value={r.expense} /></strong></div>
          <div className="stat"><span className="label">خالص</span><strong><Money value={r.net} /></strong></div>
          <div className="stat"><span className="label">کمیسیون دریافتی (خالص استرداد)</span><strong><Money value={r.commissionReceivedNet} /></strong></div>
        </div>
        <p className="small muted">فقط ثبت‌های معتبر بخش مالی شمرده می‌شود؛ ثبت‌های باطل و ارزش معاملات در این ارقام نیستند.
          {canExport && <> <a href={`/api/admin/export/finance?from=${fromJ}&to=${toJ}&status=recorded`}>دریافت CSV ثبت‌های همین بازه</a></>}</p>
        <div className="two-col">
          <section className="panel stack main">
            <h2 style={{ fontSize: 18 }}>به تفکیک دسته</h2>
            <SimpleTable head={["نوع", "دسته", "تعداد", "مبلغ"]} rows={r.byCategory.map((c) => [c.kind === "income" ? "دریافت" : "هزینه", c.category, faDigits(c.count), <Money key="m" value={c.total} />])} />
          </section>
          <aside>
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>شش ماه اخیر</h2>
              <div className="bar-chart" role="img" aria-label="نمودار دریافت و هزینهٔ ماهانه؛ ارقام در جدول زیر هم آمده است.">
                {monthly.map((m) => (
                  <div key={m.label} className="stack" style={{ gap: 4 }}>
                    <div className="bar-row"><span className="small">{m.label}</span><span className="track"><span className="fill" style={{ width: `${(m.income / max) * 100}%`, background: "var(--navy)" }} /></span><span className="tiny num">دریافت <Money value={m.income} /></span></div>
                    <div className="bar-row"><span /><span className="track"><span className="fill" style={{ width: `${(m.expense / max) * 100}%`, background: "var(--amber)" }} /></span><span className="tiny num">هزینه <Money value={m.expense} /></span></div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
        <div className="two-col">
          <section className="panel stack main">
            <h2 style={{ fontSize: 18 }}>خلاصهٔ ماهانهٔ سال {faDigits(jy)}</h2>
            <SimpleTable head={["ماه", "دریافت", "هزینه", "خالص"]}
              rows={[
                ...yearRows.map((m) => [m.label, <Money key="i" value={m.income} />, <Money key="e" value={m.expense} />, <Money key="n" value={m.net} />]),
                [<strong key="t">جمع سال</strong>, <strong key="i"><Money value={yearTotal.income} /></strong>, <strong key="e"><Money value={yearTotal.expense} /></strong>, <strong key="n"><Money value={yearTotal.income - yearTotal.expense} /></strong>],
              ]} />
          </section>
          <aside>
            <section className="panel stack">
              <h2 style={{ fontSize: 18 }}>خلاصهٔ سالانه</h2>
              <SimpleTable head={["سال", "دریافت", "هزینه", "خالص"]}
                rows={yearly.map((y) => [y.label, <Money key="i" value={y.income} />, <Money key="e" value={y.expense} />, <Money key="n" value={y.net} />])} />
              <p className="tiny muted">سال شمسی؛ «خالص» یعنی دریافت ثبت‌شده منهای هزینهٔ ثبت‌شده، نه سود حسابرسی‌شده.</p>
            </section>
          </aside>
        </div>
        <section className="panel stack">
          <h2 style={{ fontSize: 18 }}>مطالبات کمیسیون (مانده تا امروز، مستقل از بازه)</h2>
          <div className="totals">
            <div className="stat"><span className="label">کمیسیون مورد انتظار</span><strong><Money value={recv.totalExpected} /></strong></div>
            <div className="stat"><span className="label">دریافت‌شده</span><strong><Money value={recv.totalReceived} /></strong></div>
            <div className="stat"><span className="label">مانده</span><strong><Money value={recv.totalOutstanding} /></strong></div>
          </div>
          <SimpleTable head={["معامله", "ملک", "مورد انتظار", "دریافت‌شده", "مانده"]}
            rows={recv.rows.map((t) => [<Link key="l" href={`/admin/transactions/${t.id}`}><Ltr>{t.code}</Ltr></Link>, t.propertyRef ? <Ltr key="p">{t.propertyRef}</Ltr> : "—", <Money key="a" value={t.expected} />, <Money key="b" value={t.received} />, <Money key="c" value={t.outstanding} />])} />
        </section>
      </div>
    );
  }
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="muted small">داده‌ای در این بازه نیست.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} className={k > 0 ? "num" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
