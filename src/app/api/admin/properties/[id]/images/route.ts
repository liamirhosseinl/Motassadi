import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { addPropertyImage } from "@/server/services/properties";
import { ServiceError, PermissionError } from "@/server/services/common";
import { IMAGE_MAX_BYTES } from "@/server/services/storage";
import { sameOrigin } from "@/server/auth/origin";

export const dynamic = "force-dynamic";

/** One image per request, so the browser can report per-file upload progress. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sameOrigin(req))) return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ابتدا وارد شوید." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > IMAGE_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "حجم هر عکس حداکثر ۱۲ مگابایت است." }, { status: 413 });
  let file: File | null = null;
  let alt: string | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    file = f instanceof File ? f : null;
    alt = typeof fd.get("alt") === "string" ? String(fd.get("alt")) : null;
  } catch {
    return NextResponse.json({ error: "فایل دریافت نشد." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "فایلی انتخاب نشده است." }, { status: 400 });
  try {
    const db = await getDb();
    const img = await addPropertyImage(db, user, id, Buffer.from(await file.arrayBuffer()), alt);
    revalidatePath(`/admin/properties/${id}`);
    return NextResponse.json({ id: img.id });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "بارگذاری انجام نشد." }, { status: 500 });
  }
}
