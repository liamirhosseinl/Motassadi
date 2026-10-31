import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { getPublicProperty, relatedProperties } from "@/server/services/properties";
import { getSettings } from "@/server/services/settings";
import { DEAL_TYPES } from "@/lib/vocab";
import { faDigits, formatDateLong, formatNumber, whatsappLink } from "@/lib/format";
import { Breadcrumbs, DealBadge, Badge, Icon, Ltr, PriceTag, type IconName } from "@/components/ui";
import { PropertyCard, priceLines, SectionHead } from "@/components/public";
import { Gallery, InquiryForm } from "@/components/public-client";
import { breadcrumbJsonLd, JsonLd, listingJsonLd } from "@/lib/seo";

type Params = Promise<{ ref: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { ref } = await params;
  const p = await getPublicProperty(await getDb(), decodeURIComponent(ref));
  if (!p) return { title: "ملک پیدا نشد", robots: { index: false } };
  const desc = p.seoDescription ?? `${p.title} — ${p.categoryName}، ${DEAL_TYPES[p.dealType]}${p.neighborhood ? `، ${p.neighborhood}` : ""}، ${p.city}. ${(p.description ?? "").slice(0, 110)}`;
  const closed = p.status === "sold" || p.status === "rented";
  return {
    title: p.seoTitle ?? `${p.title} | ${DEAL_TYPES[p.dealType]} در ${p.city}`,
    description: desc,
    alternates: { canonical: `/properties/${p.ref}` },
    robots: closed ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website", locale: "fa_IR", title: p.title, description: desc, url: `/properties/${p.ref}`,
      images: p.images.slice(0, 1).map((i) => ({ url: `/media/${i.key}`, width: i.width, height: i.height, alt: i.alt ?? p.title })),
    },
  };
}

export default async function PropertyPage({ params }: { params: Params }) {
  const { ref } = await params;
  const db = await getDb();
  const p = await getPublicProperty(db, decodeURIComponent(ref));
  if (!p) notFound();
  const st = await getSettings();
  const related = await relatedProperties(db, p, 3);
  const closed = p.status === "sold" || p.status === "rented";
  const { lines, negotiable } = priceLines(p);
  const display = st.currency.display;
  const strip: [IconName, string, string | null][] = [
    ["area", "متراژ", p.area ? `${formatNumber(p.area)} متر` : null],
    ["bed", "اتاق خواب", p.bedrooms !== null ? faDigits(p.bedrooms) : null],
    ["bath", "سرویس", p.bathrooms !== null ? faDigits(p.bathrooms) : null],
    ["building", "طبقه", p.floor !== null ? faDigits(p.floor) : null],
    ["calendar", "سال ساخت", p.buildYear ? faDigits(p.buildYear) : null],
  ];
  const facts: [string, string | null][] = [
    ["نوع ملک", p.categoryName],
    ["متراژ", p.area ? `${formatNumber(p.area)} متر مربع` : null],
    ["زمین", p.landArea ? `${formatNumber(p.landArea)} متر مربع` : null],
    ["زیربنا", p.buildingArea ? `${formatNumber(p.buildingArea)} متر مربع` : null],
    ["اتاق", p.rooms !== null ? faDigits(p.rooms) : null],
    ["اتاق خواب", p.bedrooms !== null ? faDigits(p.bedrooms) : null],
    ["سرویس بهداشتی", p.bathrooms !== null ? faDigits(p.bathrooms) : null],
    ["طبقه", p.floor !== null ? `${faDigits(p.floor)}${p.totalFloors ? ` از ${faDigits(p.totalFloors)}` : ""}` : null],
    ["سال ساخت", p.buildYear ? faDigits(p.buildYear) : null],
    ["وضعیت بنا", p.condition],
    ["موقعیت", [p.neighborhood, p.publicLocation, p.city].filter(Boolean).join("، ")],
  ];
  const crumbs = [{ name: "خانه", path: "/" }, { name: "املاک", path: "/properties" }, { name: p.categoryName, path: `/properties?cat=${p.categorySlug}` }, { name: p.title, path: `/properties/${p.ref}` }];
  return (
    <div className="container on-top stack" style={{ gap: 28, paddingBottom: "clamp(56px, 8vw, 104px)" }}>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {!closed && <JsonLd data={listingJsonLd(p)} />}
      <Breadcrumbs items={[{ href: "/", label: "خانه" }, { href: "/properties", label: "املاک" }, { href: `/properties?cat=${p.categorySlug}`, label: p.categoryName }, { label: p.title }]} />
      {closed && <div className="closed-banner" role="status">این ملک {p.status === "sold" ? "فروخته شده" : "اجاره رفته"} است. برای املاک مشابه با ما تماس بگیرید.</div>}
      <header className="detail-head" data-reveal="">
        <div className="stack" style={{ gap: 10, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}><DealBadge deal={p.dealType} /><Badge tone="muted">{p.categoryName}</Badge>{p.status === "reserved" && <Badge tone="info">رزروشده</Badge>}</div>
          <h1>{p.title}</h1>
          <p className="loc"><Icon name="pin" size={16} />{[p.neighborhood, p.city].filter(Boolean).join("، ")}{p.publishedAt ? <span>· انتشار: {formatDateLong(p.publishedAt)}</span> : null}</p>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: "flex-start" }}>
          {lines.map((l) => <PriceTag key={l.label} value={l.value} display={display} label={l.label} size="lg" />)}
          {negotiable && <span className="neg">قابل مذاکره</span>}
        </div>
      </header>
      <div className="detail-grid">
        <div className="main">
          {p.images.length > 0 ? <Gallery images={p.images} title={p.title} /> : null}
          {strip.some(([, , v]) => v) && (
            <div className="facts-strip" data-reveal="">
              {strip.filter(([, , v]) => v).map(([ic, k, v]) => <div key={k}><Icon name={ic} size={22} /><b>{v}</b><span>{k}</span></div>)}
            </div>
          )}
          <section aria-labelledby="facts-h" className="d-sec" data-reveal="">
            <h2 id="facts-h">مشخصات</h2>
            <dl className="kv">
              {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
          {p.features.length > 0 && (
            <section aria-labelledby="feat-h" className="d-sec" data-reveal="">
              <h2 id="feat-h">امکانات</h2>
              <ul className="feat-list">
                {p.features.map((f) => <li key={f}><Icon name="check" size={18} />{f}</li>)}
              </ul>
            </section>
          )}
          {p.description && (
            <section aria-labelledby="desc-h" className="d-sec" data-reveal="">
              <h2 id="desc-h">توضیحات</h2>
              <div className="rich">{p.description.split(/\n{2,}/).map((para, i) => <p key={i} style={{ whiteSpace: "pre-line" }}>{para}</p>)}</div>
            </section>
          )}
          <p className="tiny muted">آخرین به‌روزرسانی: {formatDateLong(p.updatedAt)} · اطلاعات بر اساس اعلام مالک است و پیش از معامله باید حضوری بررسی شود.</p>
        </div>
        <aside aria-label="قیمت و تماس">
          <div className="price-card">
            {lines.map((l) => (
              <div key={l.label} className="pl"><span className="lbl">{l.label}</span><PriceTag value={l.value} display={display} size="lg" /></div>
            ))}
            {negotiable && <span className="neg">قابل مذاکره</span>}
            <a className="btn btn-primary btn-lg btn-arrow" href={`tel:${st.business.phone}`} style={{ justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 8 }}><Icon name="phone" size={18} /><Ltr>{st.business.phone}</Ltr></span><span className="disc"><Icon name="arrow" size={16} /></span>
            </a>
            {st.business.whatsapp && (
              <a className="btn btn-light" href={`${whatsappLink(st.business.whatsapp)}?text=${encodeURIComponent(`سلام، دربارهٔ ملک ${p.ref} سؤال دارم.`)}`} target="_blank" rel="noopener">
                <Icon name="whatsapp" size={18} />پیام در واتساپ
              </a>
            )}
            <div className="ref-line"><span>کد ملک</span><b>{faDigits(p.ref)}</b></div>
          </div>
          {!closed && (
            <div className="form-card">
              <h2>درخواست بازدید یا اطلاعات</h2>
              <InquiryForm propertyRef={p.ref} notice={st.privacy.inquiryNotice} compact />
            </div>
          )}
        </aside>
      </div>
      {related.length > 0 && (
        <section aria-labelledby="rel-h" style={{ marginTop: 24 }}>
          <SectionHead id="rel-h" n="" kicker="پیشنهاد مشابه" title="املاک" accent="مشابه." link={{ href: `/properties?cat=${p.categorySlug}&deal=${p.dealType}`, label: "بیشتر" }} />
          <div className="grid-cards">{related.map((r, i) => <PropertyCard key={r.id} p={r} display={display} d={i} />)}</div>
        </section>
      )}
    </div>
  );
}
