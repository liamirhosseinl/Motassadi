import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { activeCategories, activeFeatures, parsePublicSearch, publicNeighborhoods, searchPublicProperties } from "@/server/services/properties";
import { PropertyCard } from "@/components/public";
import { Breadcrumbs, EmptyState, Icon, Pagination } from "@/components/ui";
import fs from "node:fs";
import path from "node:path";
import { DEAL_TYPES } from "@/lib/vocab";
import { faDigits, formatMoneyShort, formatNumber } from "@/lib/format";
import { getSettings } from "@/server/services/settings";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const f = parsePublicSearch(await searchParams);
  const db = await getDb();
  const cats = await activeCategories(db);
  const cat = cats.find((c) => c.slug === f.cat)?.name;
  const parts = [cat ?? "املاک", f.deal ? DEAL_TYPES[f.deal] : null, "در زرند"].filter(Boolean);
  const title = parts.join(" ");
  // Only plain category/deal listings are indexable; filtered permutations are noindex to avoid thin duplicates.
  const extra = Object.keys(f).filter((k) => !["deal", "cat", "sort", "page"].includes(k) && (f as Record<string, unknown>)[k] !== undefined);
  const canonical = `/properties${f.deal || f.cat ? `?${new URLSearchParams({ ...(f.deal ? { deal: f.deal } : {}), ...(f.cat ? { cat: f.cat } : {}) })}` : ""}`;
  return {
    title,
    description: `آگهی‌های ${title} — املاک متصدی. جست‌وجو بر اساس محله، قیمت و متراژ.`,
    alternates: { canonical },
    robots: extra.length || f.page > 1 || f.sort !== "newest" ? { index: false, follow: true } : undefined,
  };
}

export default async function PropertiesPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const f = parsePublicSearch(params);
  const db = await getDb();
  const st = await getSettings();
  const [cats, features, hoods, res] = await Promise.all([activeCategories(db), activeFeatures(db), publicNeighborhoods(db), searchPublicProperties(db, f)]);

  const view: "grid" | "list" = params.view === "list" ? "list" : "grid";
  const withView = (v: "grid" | "list") => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) {
      if (k === "view" || val === undefined) continue;
      (Array.isArray(val) ? val : [val]).forEach((x) => q.append(k, x));
    }
    if (v === "list") q.set("view", "list");
    const s = q.toString();
    return s ? `/properties?${s}` : "/properties";
  };

  const active: { label: string; key: string }[] = [];
  if (f.q) active.push({ key: "q", label: `«${f.q}»` });
  if (f.deal) active.push({ key: "deal", label: DEAL_TYPES[f.deal] });
  if (f.cat) active.push({ key: "cat", label: cats.find((c) => c.slug === f.cat)?.name ?? f.cat });
  if (f.hood) active.push({ key: "hood", label: f.hood });
  if (f.minPrice !== undefined) active.push({ key: "minPrice", label: `از ${formatMoneyShort(f.minPrice)}` });
  if (f.maxPrice !== undefined) active.push({ key: "maxPrice", label: `تا ${formatMoneyShort(f.maxPrice)}` });
  if (f.minArea !== undefined) active.push({ key: "minArea", label: `از ${formatNumber(f.minArea)} متر` });
  if (f.maxArea !== undefined) active.push({ key: "maxArea", label: `تا ${formatNumber(f.maxArea)} متر` });
  if (f.beds !== undefined) active.push({ key: "beds", label: `${faDigits(f.beds)}+ خواب` });
  for (const id of f.feat ?? []) active.push({ key: "feat", label: features.find((x) => x.id === id)?.name ?? "" });

  const without = (key: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === key || k === "page" || v === undefined) continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x));
    }
    const s = q.toString();
    return s ? `/properties?${s}` : "/properties";
  };

  const catName = f.cat ? cats.find((c) => c.slug === f.cat)?.name : undefined;
  const bgName = `cat-${f.cat ?? "villa"}.jpg`;
  const bg = fs.existsSync(path.join(process.cwd(), "public", "images", "site", bgName)) ? `/images/site/${bgName}` : null;
  return (
    <>
    <section className="page-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {bg && <img src={bg} alt="" width={1400} height={900} />}
      <span className="glow" aria-hidden="true" />
      <div className="container">
        <Breadcrumbs items={[{ href: "/", label: "خانه" }, { label: "املاک" }]} />
        <h1>{f.deal ? `املاک ${DEAL_TYPES[f.deal]}` : "همهٔ املاک"}{catName ? <span className="accent"> — {catName}</span> : null}</h1>
        <p className="sub">آگهی‌های {catName ?? "املاک"} {st.business.city}؛ با فیلتر محله، قیمت، متراژ و امکانات جست‌وجو کنید.</p>
      </div>
    </section>
    <div className="container section tight stack" style={{ gap: 22 }}>
      <div className="results-bar">
        <p className="count" role="status"><b>{faDigits(res.total)}</b> ملک پیدا شد</p>
        <nav className="view-toggle" aria-label="نحوهٔ نمایش نتایج">
          <Link href={withView("grid")} aria-current={view === "grid" ? "true" : undefined} scroll={false}><Icon name="grid" size={16} />شبکه‌ای</Link>
          <Link href={withView("list")} aria-current={view === "list" ? "true" : undefined} scroll={false}><Icon name="list" size={16} />فهرستی</Link>
        </nav>
      </div>

      <div className="results-layout">
        <aside>
          <form method="get" action="/properties" className="panel filters" aria-label="فیلتر املاک">
            <span className="f-title"><Icon name="filter" size={18} />فیلتر نتایج</span>
            {view === "list" && <input type="hidden" name="view" value="list" />}
            <div className="field"><label htmlFor="f-q">جست‌وجو یا کد ملک</label><input id="f-q" name="q" className="input" defaultValue={f.q} maxLength={100} /></div>
            <div className="field"><label htmlFor="f-deal">نوع معامله</label>
              <select id="f-deal" name="deal" className="select" defaultValue={f.deal ?? ""}><option value="">همه</option>{Object.entries(DEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label htmlFor="f-cat">نوع ملک</label>
              <select id="f-cat" name="cat" className="select" defaultValue={f.cat ?? ""}><option value="">همه</option>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div>
            {hoods.length > 0 && (
              <div className="field"><label htmlFor="f-hood">محله</label>
                <select id="f-hood" name="hood" className="select" defaultValue={f.hood ?? ""}><option value="">همه</option>{hoods.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
            )}
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <legend className="label">قیمت یا ودیعه (به تومان)</legend>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input aria-label="حداقل قیمت به تومان" name="minPrice" className="input ltr" inputMode="numeric" placeholder="از" defaultValue={f.minPrice} dir="ltr" />
                <input aria-label="حداکثر قیمت به تومان" name="maxPrice" className="input ltr" inputMode="numeric" placeholder="تا" defaultValue={f.maxPrice} dir="ltr" />
              </div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <legend className="label">متراژ (متر مربع)</legend>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input aria-label="حداقل متراژ" name="minArea" className="input ltr" inputMode="numeric" placeholder="از" defaultValue={f.minArea} dir="ltr" />
                <input aria-label="حداکثر متراژ" name="maxArea" className="input ltr" inputMode="numeric" placeholder="تا" defaultValue={f.maxArea} dir="ltr" />
              </div>
            </fieldset>
            <div className="field"><label htmlFor="f-beds">تعداد خواب</label>
              <select id="f-beds" name="beds" className="select" defaultValue={f.beds ?? ""}><option value="">فرقی ندارد</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{faDigits(n)} و بیشتر</option>)}</select></div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">امکانات</legend>
              <div className="checks" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {features.slice(0, 10).map((x) => (
                  <label key={x.id} className="check"><input type="checkbox" name="feat" value={x.id} defaultChecked={f.feat?.includes(x.id)} />{x.name}</label>
                ))}
              </div>
            </fieldset>
            <div className="field"><label htmlFor="f-sort">مرتب‌سازی</label>
              <select id="f-sort" name="sort" className="select" defaultValue={f.sort}>
                <option value="newest">جدیدترین</option><option value="price_asc">ارزان‌ترین</option><option value="price_desc">گران‌ترین</option>
                <option value="area_desc">بزرگ‌ترین</option><option value="area_asc">کوچک‌ترین</option>
              </select></div>
            <button type="submit" className="btn btn-primary"><Icon name="search" size={18} />اعمال فیلتر</button>
            <Link href="/properties" className="btn btn-ghost">پاک کردن همهٔ فیلترها</Link>
          </form>
        </aside>

        <div className="results">
          {active.length > 0 && (
            <div className="row" aria-label="فیلترهای فعال">
              {active.map((a, i) => <Link key={i} className="chip" href={without(a.key)} aria-label={`حذف فیلتر ${a.label}`}>{a.label} ✕</Link>)}
            </div>
          )}
          {res.items.length === 0 ? (
            <EmptyState title="ملکی با این مشخصات پیدا نشد" action={<div className="row"><Link className="btn btn-outline" href="/properties">نمایش همهٔ املاک</Link><Link className="btn btn-primary" href="/contact">ثبت درخواست</Link></div>}>
              فیلترها را کمتر کنید، یا درخواستتان را ثبت کنید تا با ورود ملک مناسب تماس بگیریم.
            </EmptyState>
          ) : (
            <div className={view === "list" ? "grid-cards as-list" : "grid-cards"}>{res.items.map((p, i) => <PropertyCard key={p.id} p={p} display={st.currency.display} d={i % 3} />)}</div>
          )}
          <Pagination page={f.page} total={res.total} pageSize={res.pageSize} basePath="/properties" params={params} />
        </div>
      </div>
    </div>
    </>
  );
}
