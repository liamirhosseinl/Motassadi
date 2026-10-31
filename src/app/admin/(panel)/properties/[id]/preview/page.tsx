import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import { getPropertyForActor, publicCard } from "@/server/services/properties";
import { ServiceError } from "@/server/services/common";
import { formatNumber, faDigits } from "@/lib/format";
import { DealBadge, Ltr, PriceTag, PropertyStatusBadge } from "@/components/ui";
import { priceLines } from "@/components/public";
import { Gallery } from "@/components/public-client";

export const metadata = { title: "پیش‌نمایش آگهی" };

/** Staff preview: renders exactly the public fields (via publicCard) regardless of publication status. */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("properties.view");
  const id = Number((await params).id);
  const db = await getDb();
  let row;
  try { row = await getPropertyForActor(db, user, id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const p = publicCard(row);
  const [cat] = await db.select().from(s.propertyCategories).where(eq(s.propertyCategories.id, row.categoryId));
  const images = await db.select({ id: s.propertyImages.id, key: s.propertyImages.storageKey, thumb: s.propertyImages.thumbKey, alt: s.propertyImages.alt, width: s.propertyImages.width, height: s.propertyImages.height })
    .from(s.propertyImages).where(eq(s.propertyImages.propertyId, id)).orderBy(desc(s.propertyImages.isCover), asc(s.propertyImages.sort));
  const feats = await db.select({ name: s.propertyFeatures.name }).from(s.propertyFeatureLinks).innerJoin(s.propertyFeatures, eq(s.propertyFeatures.id, s.propertyFeatureLinks.featureId)).where(eq(s.propertyFeatureLinks.propertyId, id));
  return (
    <>
      <div className="alert alert-info row between" role="status">
        <span>پیش‌نمایش — این همان چیزی است که بازدیدکننده می‌بیند. وضعیت فعلی: <PropertyStatusBadge status={row.status} /></span>
        <Link className="btn btn-navy btn-sm" href={`/admin/properties/${id}`}>بازگشت به ویرایش</Link>
      </div>
      <div className="stack" style={{ gap: 16, maxWidth: 900 }}>
        <div className="row"><DealBadge deal={p.dealType} /><span className="small muted">کد <Ltr>{p.ref}</Ltr> · {cat?.name}</span></div>
        <h1 style={{ fontSize: 32 }}>{p.title}</h1>
        {images.length > 0 ? <Gallery images={images} title={p.title} /> : <div className="alert alert-warning">عکسی ندارد.</div>}
        <div className="panel row" style={{ gap: 24 }}>{priceLines(p).lines.map((l) => <PriceTag key={l.label} value={l.value} label={l.label} />)}{priceLines(p).negotiable && <span className="neg">قابل مذاکره</span>}</div>
        <dl className="kv">
          {p.area ? <div><dt>متراژ</dt><dd>{formatNumber(p.area)} متر</dd></div> : null}
          {p.bedrooms !== null ? <div><dt>خواب</dt><dd>{faDigits(p.bedrooms)}</dd></div> : null}
          {p.floor !== null ? <div><dt>طبقه</dt><dd>{faDigits(p.floor)}</dd></div> : null}
          <div><dt>موقعیت</dt><dd>{[p.neighborhood, p.publicLocation, p.city].filter(Boolean).join("، ")}</dd></div>
        </dl>
        {feats.length > 0 && <p>امکانات: {feats.map((f) => f.name).join("، ")}</p>}
        {p.description && <div className="rich" style={{ whiteSpace: "pre-line" }}>{p.description}</div>}
      </div>
    </>
  );
}
