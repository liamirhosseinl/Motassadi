import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { getAttachmentForActor } from "@/server/services/deals";
import { PermissionError, ServiceError } from "@/server/services/common";
import { storage } from "@/server/services/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const db = await getDb();
  try {
    const a = await getAttachmentForActor(db, user, id);
    const data = await storage().get(a.storageKey);
    if (!data) return new Response("Not found", { status: 404 });
    const ext = a.storageKey.split(".").pop();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mime,
        "Content-Disposition": `attachment; filename="attachment-${a.id}.${ext}"; filename*=UTF-8''${encodeURIComponent(a.originalName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof PermissionError) return new Response("Forbidden", { status: 403 });
    if (e instanceof ServiceError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
