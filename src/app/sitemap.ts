import type { MetadataRoute } from "next";
import { getDb } from "@/server/db";
import { activeCategories, sitemapProperties } from "@/server/services/properties";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Only public, published listings and public pages. Admin, drafts, sold/rented and filtered searches are excluded. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const base = siteUrl();
  const [props, cats] = await Promise.all([sitemapProperties(db), activeCategories(db)]);
  const statics = ["", "/properties", "/properties?deal=sale", "/properties?deal=rent", "/about", "/contact", "/guide/buy-sell", "/guide/rent", "/privacy", "/terms"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 })),
    ...cats.map((c) => ({ url: `${base}/properties?cat=${c.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...props.map((p) => ({ url: `${base}/properties/${p.ref}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
