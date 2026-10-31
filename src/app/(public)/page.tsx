import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { activeCategories, featuredProperties, recentProperties, searchPublicProperties, parsePublicSearch } from "@/server/services/properties";
import { HeroSearch, PropertyCard, SectionHead } from "@/components/public";
import { EmptyState, Icon, Ltr } from "@/components/ui";
import { localBusinessJsonLd, JsonLd } from "@/lib/seo";
import { faDigits } from "@/lib/format";
import { DEAL_TYPES } from "@/lib/vocab";
import fs from "node:fs";
import path from "node:path";

export async function generateMetadata(): Promise<Metadata> {
  const st = await getSettings();
  return {
    title: { absolute: `${st.business.name} — خرید، فروش و اجارهٔ ملک در ${st.business.city}` },
    description: st.site.description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", locale: "fa_IR", siteName: st.business.name, title: st.business.name, description: st.site.description, images: [{ url: "/images/site/hero.jpg" }] },
  };
}

/** Site imagery is optional: a missing file falls back to the brand colour, never a broken image. */
const siteImg = (name: string) => (fs.existsSync(path.join(process.cwd(), "public", "images", "site", name)) ? `/images/site/${name}` : null);

const STEPS = [
  { t: "جست‌وجو و انتخاب", d: "آگهی‌ها را بر اساس محله، نوع ملک، قیمت و متراژ ببینید و موارد مناسب را جدا کنید." },
  { t: "هماهنگی بازدید", d: "درخواست بازدید یا اطلاعات بیشتر را ثبت کنید یا تماس بگیرید؛ دفتر برای هماهنگی با شما تماس می‌گیرد." },
  { t: "مشاوره و قرارداد", d: "بررسی مدارک و شرایط معامله و تنظیم قرارداد، حضوری در دفتر انجام می‌شود." },
];

export default async function HomePage() {
  const db = await getDb();
  const st = await getSettings();
  const [cats, featuredAll, all] = await Promise.all([activeCategories(db), featuredProperties(db, 6), searchPublicProperties(db, parsePublicSearch({}))]);
  // The bento grid reads best with exactly 3 or 6 cards; any extra featured listings flow into "recent".
  const featured = featuredAll.length >= 6 ? featuredAll : featuredAll.slice(0, 3);
  const recent = await recentProperties(db, 8, featured.map((f) => f.id));
  const hasAny = featured.length + recent.length > 0;
  const hero = siteImg("hero.jpg");
  const cta = siteImg("cta.jpg");
  const display = st.currency.display;
  const catTiles = cats.filter((c) => c.slug !== "other").slice(0, 6);
  return (
    <>
      <JsonLd data={localBusinessJsonLd(st)} />
      <section className="hero-x" aria-labelledby="hero-h">
        {hero && (
          <div className="hero-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero} alt="" width={2400} height={1600} fetchPriority="high" />
          </div>
        )}
        <div className="hero-shade" aria-hidden="true" />
        <div className="container hero-content">
          <span className="kicker">{st.business.name} · {st.business.city}، استان {st.business.province}</span>
          <h1 id="hero-h" className="display">
            <span className="line"><span>خانه‌ای که</span></span>
            <span className="line"><span className="accent">در انتظار شماست.</span></span>
          </h1>
          <p className="lead">{st.site.tagline}{st.site.description ? `. ${st.site.description}` : ""}</p>
          <div className="hero-actions">
            <Link href="/properties" className="btn btn-primary btn-lg btn-arrow">مشاهدهٔ املاک<span className="disc"><Icon name="arrow" size={18} /></span></Link>
            <a href={`tel:${st.business.phone}`} className="btn btn-light btn-lg"><Icon name="phone" size={18} />تماس با دفتر</a>
          </div>
        </div>
        <div className="container hero-bottom">
          <HeroSearch categories={cats} />
          <div className="hero-stats" aria-label="آمار آگهی‌ها">
            <span><b data-count={all.total}>{faDigits(all.total)}</b>آگهی فعال</span>
            <span><b data-count={cats.length}>{faDigits(cats.length)}</b>نوع ملک</span>
            <span><b data-count={Object.keys(DEAL_TYPES).length}>{faDigits(Object.keys(DEAL_TYPES).length)}</b>نوع معامله</span>
          </div>
        </div>
        <a href="#featured" className="scroll-cue" aria-label="رفتن به املاک ویژه"><Icon name="chevron-d" size={20} /></a>
      </section>

      {!hasAny && (
        <section className="section container">
          <EmptyState title="به‌زودی آگهی‌های تازه منتشر می‌شود" action={<a className="btn btn-primary" href={`tel:${st.business.phone}`}>تماس با دفتر: <Ltr>{st.business.phone}</Ltr></a>}>
            اگر دنبال ملک خاصی هستید یا می‌خواهید ملکتان را بسپارید، با ما تماس بگیرید.
          </EmptyState>
        </section>
      )}

      {featured.length > 0 && (
        <section id="featured" className="section container" aria-labelledby="featured-h">
          <SectionHead id="featured-h" n="۰۱" kicker="املاک ویژه" title="املاکی که" accent="پیشنهاد ما هستند." link={{ href: "/properties", label: "مشاهدهٔ همه" }} />
          <div className="bento">
            {featured.map((p, i) => <PropertyCard key={p.id} p={p} display={display} big={i === 0 && featured.length >= 3} d={i} />)}
          </div>
        </section>
      )}

      <div className="marquee" aria-hidden="true">
        <div className="track">
          {[0, 1].map((k) => (
            <span key={k}>
              {Object.values(DEAL_TYPES).map((d, i) => <span key={d} className={i % 2 ? "o" : ""}>{d}<i>✦</i></span>)}
              {catTiles.slice(0, 4).map((c, i) => <span key={c.id} className={i % 2 ? "" : "o"}>{c.name}<i>✦</i></span>)}
            </span>
          ))}
        </div>
      </div>

      {catTiles.length > 0 && (
        <section className="section container" aria-labelledby="cats-h">
          <SectionHead id="cats-h" n="۰۲" kicker="دسته‌بندی املاک" title="دنبال چه" accent="ملکی هستید؟" text="از آپارتمان و خانهٔ ویلایی تا زمین، باغ و ملک تجاری؛ نوع ملک را انتخاب کنید." />
          <div className="cat-rail">
            {catTiles.map((c, i) => {
              const img = siteImg(`cat-${c.slug}.jpg`);
              return (
                <Link key={c.id} href={`/properties?cat=${c.slug}`} className={`cat-tile ${i === 0 || i === 5 ? "wide" : ""}`} data-reveal="scale" style={{ "--d": i } as React.CSSProperties}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img && <img src={img} alt="" loading="lazy" width={1400} height={1000} />}
                  <span className="in">
                    <span><strong>{c.name}</strong><small>مشاهدهٔ آگهی‌ها</small></span>
                    <span className="disc" aria-hidden="true"><Icon name="arrow" size={18} /></span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section on-dark" aria-labelledby="steps-h">
        <div className="container">
          <SectionHead id="steps-h" n="۰۳" kicker="روند کار" title="سه قدم تا" accent="کلید خانه." link={{ href: "/guide/buy-sell", label: "راهنمای خرید و فروش" }} />
          <div className="steps">
            {STEPS.map((s, i) => (
              <div key={s.t} className="step" data-reveal="" style={{ "--d": i } as React.CSSProperties}>
                <span className="outline-num">{faDigits(String(i + 1).padStart(2, "0"))}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="section container" aria-labelledby="recent-h">
          <SectionHead id="recent-h" n="۰۴" kicker="تازه‌ترین آگهی‌ها" title="تازه به" accent="فهرست اضافه شد." link={{ href: "/properties?sort=newest", label: "همهٔ آگهی‌ها" }} />
          <div className="grid-cards rail">{recent.map((p, i) => <PropertyCard key={p.id} p={p} display={display} d={i % 4} />)}</div>
        </section>
      )}

      <section className="cta-band" aria-labelledby="cta-h">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cta && <img src={cta} alt="" loading="lazy" width={2400} height={1600} />}
        <div className="container in">
          <span className="kicker kicker-light" data-reveal="">سپردن ملک</span>
          <h2 id="cta-h" data-reveal="" style={{ "--d": 1 } as React.CSSProperties}>ملکی برای فروش یا اجاره <span className="accent">دارید؟</span></h2>
          <p data-reveal="" style={{ "--d": 2 } as React.CSSProperties}>ملک شما با اطلاعات کامل و عکس واقعی معرفی می‌شود. برای ثبت، با دفتر تماس بگیرید یا حضوری مراجعه کنید — {st.business.address}</p>
          <div className="row" data-reveal="" style={{ "--d": 3 } as React.CSSProperties}>
            <Link className="btn btn-primary btn-lg btn-arrow" href="/contact">ثبت درخواست<span className="disc"><Icon name="arrow" size={18} /></span></Link>
            <a className="btn btn-light btn-lg" href={`tel:${st.business.phone}`}><Icon name="phone" size={18} /><Ltr>{st.business.phone}</Ltr></a>
          </div>
        </div>
      </section>
    </>
  );
}
