import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { exportDataset } from "@/server/services/exports";
import { PermissionError, ServiceError } from "@/server/services/common";
import { audit } from "@/server/services/infra";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { dataset } = await params;
  const db = await getDb();
  const query = Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    const out = await exportDataset(db, user, dataset, query);
    await audit(db, user.id, "export.csv", "export", dataset, { rows: out.rows });
    return new Response(out.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${out.filename}"`,
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
