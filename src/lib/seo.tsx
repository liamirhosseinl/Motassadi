import type { SettingsMap } from "@/server/services/settings-defaults";

export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Safely embeds JSON-LD (escapes "<" so content cannot close the script tag). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

const intlPhone = (p: string) => (p.startsWith("0") ? `+98${p.slice(1)}` : p);

/** Only verified business facts: name, address, phone. No coordinates, hours or ratings are invented. */
export function localBusinessJsonLd(st: SettingsMap) {
  const sameAs = [st.social.instagram, st.social.telegram].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": `${siteUrl()}/#business`,
    name: st.business.name,
    url: siteUrl(),
    telephone: intlPhone(st.business.phone),
    logo: `${siteUrl()}/brand/motasadi_logo-vertical_color.svg`,
    address: { "@type": "PostalAddress", streetAddress: st.business.address, addressLocality: st.business.city, addressRegion: st.business.province, addressCountry: "IR" },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${siteUrl()}${it.path}` })),
  };
}

/** Listing data exactly as shown on the page. Prices are converted toman → IRR (×10) because schema.org uses ISO 4217. */
export function listingJsonLd(p: {
  ref: string; title: string; description: string | null; publishedAt: Date | null; dealType: string;
  price: number | null; deposit: number | null; images: { key: string }[];
}) {
  const amount = p.dealType === "sale" || p.dealType === "exchange" ? p.price : p.deposit;
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    url: `${siteUrl()}/properties/${p.ref}`,
    ...(p.description ? { description: p.description.slice(0, 500) } : {}),
    ...(p.publishedAt ? { datePosted: p.publishedAt.toISOString() } : {}),
    ...(p.images.length ? { image: p.images.slice(0, 5).map((i) => `${siteUrl()}/media/${i.key}`) } : {}),
    ...(amount ? { offers: { "@type": "Offer", price: amount * 10, priceCurrency: "IRR", seller: { "@id": `${siteUrl()}/#business` } } } : {}),
  };
}
