import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// Read SITE_URL at request time so one build works for staging and production.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
