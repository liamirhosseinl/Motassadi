import Link from "next/link";
import { getDb } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { activeCategories } from "@/server/services/properties";
import { Icon, Ltr } from "@/components/ui";
import { BackToTop, MotionRoot, SiteHeader } from "@/components/site-chrome";
import { whatsappLink } from "@/lib/format";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "خانه" },
  { href: "/properties", label: "همهٔ املاک" },
  { href: "/properties?deal=sale", label: "خرید" },
  { href: "/properties?deal=rent", label: "اجاره" },
  { href: "/guide/buy-sell", label: "راهنما" },
  { href: "/about", label: "دربارهٔ ما" },
  { href: "/contact", label: "تماس" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const st = await getSettings();
  const b = st.business;
  const cats = await activeCategories(await getDb());
  return (
    <div className="site">
      <a href="#main" className="skip-link">پرش به محتوای اصلی</a>
      <SiteHeader nav={NAV} name={b.name} phone={b.phone} logo="/brand/motasadi_logo-horizontal_reverse.svg" />
      <MotionRoot />
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="container">
          <div className="f-top">
            <div className="f-brand" data-reveal="">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/motasadi_logo-horizontal_reverse.svg" alt={b.name} width={220} height={52} />
              <p>{st.site.tagline}{st.site.description ? ` — ${st.site.description}` : ""}</p>
            </div>
            <div className="f-phone" data-reveal="" style={{ "--d": 1 } as React.CSSProperties}>
              <small>مشاوره و هماهنگی بازدید</small>
              <a className="big-num" href={`tel:${b.phone}`}><Ltr>{b.phone}</Ltr></a>
              <Link href="/contact" className="btn btn-primary btn-arrow" style={{ marginTop: 8 }}>ثبت درخواست<span className="disc"><Icon name="arrow" size={16} /></span></Link>
            </div>
          </div>
          <div className="f-cols">
            <div>
              <h2>دفتر</h2>
              <address className="addr" style={{ fontStyle: "normal" }}>
                {b.name}<br />{b.ownerName}<br />{b.address}
              </address>
              <div className="socials">
                <a href={`tel:${b.phone}`} aria-label="تماس تلفنی"><Icon name="phone" size={18} /></a>
                {b.whatsapp && <a href={whatsappLink(b.whatsapp)} rel="noopener" target="_blank" aria-label="واتساپ"><Icon name="whatsapp" size={18} /></a>}
                {st.social.instagram && <a href={st.social.instagram} rel="noopener me" target="_blank" aria-label="اینستاگرام"><Icon name="instagram" size={18} /></a>}
                {st.social.telegram && <a href={st.social.telegram} rel="noopener me" target="_blank" aria-label="تلگرام"><Icon name="telegram" size={18} /></a>}
              </div>
            </div>
            <div>
              <h2>املاک</h2>
              <ul>
                <li><Link href="/properties?deal=sale">املاک فروشی</Link></li>
                <li><Link href="/properties?deal=rent">املاک اجاره‌ای</Link></li>
                <li><Link href="/properties?deal=mortgage">رهن کامل</Link></li>
                <li><Link href="/properties?deal=exchange">معاوضه</Link></li>
              </ul>
            </div>
            <div>
              <h2>انواع ملک</h2>
              <ul>
                {cats.slice(0, 6).map((c) => <li key={c.id}><Link href={`/properties?cat=${c.slug}`}>{c.name}</Link></li>)}
              </ul>
            </div>
            <div>
              <h2>راهنما و قوانین</h2>
              <ul>
                <li><Link href="/guide/buy-sell">راهنمای خرید و فروش</Link></li>
                <li><Link href="/guide/rent">راهنمای اجاره</Link></li>
                <li><Link href="/about">دربارهٔ ما</Link></li>
                <li><Link href="/privacy">حریم خصوصی</Link></li>
                <li><Link href="/terms">شرایط استفاده</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="f-word" aria-hidden="true">املاک متصدی</div>
        <div className="container f-legal">
          <span>© {b.name} — {b.city}، استان {b.province}</span>
          <BackToTop />
        </div>
      </footer>
    </div>
  );
}
