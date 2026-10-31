import Link from "next/link";
import type { PublicCard } from "@/server/services/properties";
import { DEAL_TYPES } from "@/lib/vocab";
import { faDigits, formatMoneyShort, formatNumber, type CurrencyDisplay } from "@/lib/format";
import { Badge, DealBadge, Icon, Mark, PriceTag } from "./ui";

export const mediaUrl = (key: string) => `/media/${key}`;

type PriceInput = { dealType: string; price: number | null; deposit: number | null; rentMonthly: number | null; priceHidden: boolean; priceNegotiable: boolean };
export type PriceLine = { label: string; value: number | null };

/** Structured price lines for a listing; `value: null` means "call us". */
export function priceLines(p: PriceInput): { lines: PriceLine[]; negotiable: boolean } {
  if (p.priceHidden) return { lines: [{ label: "قیمت", value: null }], negotiable: false };
  if (p.dealType === "rent") {
    const out: PriceLine[] = [];
    if (p.deposit) out.push({ label: "ودیعه", value: p.deposit });
    if (p.rentMonthly) out.push({ label: "اجارهٔ ماهانه", value: p.rentMonthly });
    return { lines: out.length ? out : [{ label: "اجاره", value: null }], negotiable: p.priceNegotiable };
  }
  if (p.dealType === "mortgage") return { lines: [{ label: "رهن کامل", value: p.deposit || null }], negotiable: p.priceNegotiable };
  return { lines: [{ label: "قیمت", value: p.price || null }], negotiable: p.priceNegotiable };
}

export function PropertyCard({ p, display = "toman", big, d }: { p: PublicCard; display?: CurrencyDisplay; big?: boolean; d?: number }) {
  const { lines, negotiable } = priceLines(p);
  return (
    <Link href={`/properties/${p.ref}`} className={big ? "pcard big" : "pcard"} data-reveal="" style={{ "--d": d ?? 0 } as React.CSSProperties}>
      <div className="media">
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(p.cover.key)} alt={p.cover.alt} loading="lazy" width={big ? 1600 : 640} height={big ? 1200 : 480} />
        ) : (
          <div className="noimg"><Mark size={64} stroke="#B59C7C" sun="#FFE2B3" /></div>
        )}
        <div className="tags">
          <DealBadge deal={p.dealType} />
          {p.status === "reserved" && <Badge tone="info">رزروشده</Badge>}
          {p.featured && <Badge tone="navy">ویژه</Badge>}
        </div>
        <span className="ref">{faDigits(p.ref)}</span>
      </div>
      <div className="body">
        <span className="where"><Icon name="pin" size={15} /><span>{p.categoryName}{(p.neighborhood || p.publicLocation) ? ` · ${p.neighborhood ?? p.publicLocation}` : ""}</span></span>
        <h3>{p.title}</h3>
        {(p.area || p.bedrooms) ? (
          <div className="specs">
            {p.area ? <span><Icon name="area" size={14} />{formatNumber(p.area)} متر</span> : null}
            {p.bedrooms ? <span><Icon name="bed" size={14} />{faDigits(p.bedrooms)} خواب</span> : null}
          </div>
        ) : null}
        <div className="foot">
          <div className="prices">
            {lines.map((l) => <PriceTag key={l.label} value={l.value} display={display} label={l.label} size={lines.length > 1 && !big ? "sm" : undefined} />)}
            {negotiable && <span className="neg">قابل مذاکره</span>}
          </div>
          <span className="go" aria-hidden="true"><Icon name="arrow" size={18} /></span>
        </div>
      </div>
    </Link>
  );
}

/** Hero search: deal pills + query + type + budget, all a plain GET form (works without JS). */
export function HeroSearch({ categories }: { categories: { slug: string; name: string }[] }) {
  const deals: [string, string][] = [["", "همه"], ...Object.entries(DEAL_TYPES)];
  return (
    <form action="/properties" method="get" className="glass-search" role="search" aria-label="جست‌وجوی ملک">
      <fieldset className="deal-pills" style={{ border: 0, margin: 0, minWidth: 0 }}>
        <legend className="sr-only">نوع معامله</legend>
        {deals.map(([k, v]) => (
          <span key={k || "all"}>
            <input type="radio" id={`hd-${k || "all"}`} name="deal" value={k} defaultChecked={k === ""} />
            <label htmlFor={`hd-${k || "all"}`}>{v}</label>
          </span>
        ))}
      </fieldset>
      <div className="search-row">
        <div className="sf">
          <label htmlFor="s-q">کجا یا چه ملکی؟</label>
          <input id="s-q" name="q" className="input" placeholder="محله، عنوان یا کد ملک" maxLength={100} />
        </div>
        <div className="sf">
          <label htmlFor="s-cat">نوع ملک</label>
          <select id="s-cat" name="cat" className="select" defaultValue="">
            <option value="">همهٔ انواع</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="sf">
          <label htmlFor="s-max">بودجه (قیمت یا ودیعه)</label>
          <select id="s-max" name="maxPrice" className="select" defaultValue="">
            <option value="">بدون محدودیت</option>
            {[200e6, 500e6, 1e9, 2e9, 3e9, 5e9, 8e9, 12e9].map((v) => <option key={v} value={v}>تا {formatMoneyShort(v)}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary go"><Icon name="search" size={20} />جست‌وجو</button>
      </div>
    </form>
  );
}

/** Section heading in the ONYQ rhythm: numbered kicker, two-tone display title, optional link. */
export function SectionHead({ id, n, kicker, title, accent, text, link }: { id?: string; n: string; kicker: string; title: string; accent?: string; text?: string; link?: { href: string; label: string } }) {
  return (
    <div className="sec-head">
      <div className="t" data-reveal="">
        <span className="kicker">{n ? <><span className="k-num">{n}</span> / </> : null}{kicker}</span>
        <h2 id={id}>{title}{accent ? <> <span className="accent">{accent}</span></> : null}</h2>
        {text && <p>{text}</p>}
      </div>
      {link && (
        <Link href={link.href} className="link-arrow" data-reveal="" style={{ "--d": 2 } as React.CSSProperties}>
          {link.label}<span className="disc"><Icon name="arrow" size={18} /></span>
        </Link>
      )}
    </div>
  );
}
