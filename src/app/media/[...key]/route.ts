import { getDb } from "@/server/db";
import { isPublicImageKey } from "@/server/services/properties";
import { storage } from "@/server/services/storage";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Property images. Public only while the listing is publicly visible; otherwise staff with properties.view. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.join("/");
  if (!/^p\/\d+\/[0-9a-f-]{36}(_t)?\.webp$/.test(key)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const isPublic = await isPublicImageKey(db, key);
  if (!isPublic) {
    const user = await getCurrentUser();
    if (!user || !user.permissions.has("properties.view")) return new Response("Not found", { status: 404 });
  }
  const data = await storage().get(key);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": isPublic ? "public, max-age=86400, stale-while-revalidate=604800" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
