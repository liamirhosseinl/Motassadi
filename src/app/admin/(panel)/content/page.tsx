import Link from "next/link";
import { getDb } from "@/server/db";
import { requirePage } from "@/server/auth/session";
import { listPages } from "@/server/services/admin";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui";

export const metadata = { title: "صفحات سایت" };

export default async function ContentList() {
  await requirePage("content.manage");
  const pages = await listPages(await getDb());
  return (
    <>
      <div className="page-header"><h1>صفحات سایت</h1></div>
      <p className="muted small" style={{ marginBottom: 12 }}>متن صفحات حقوقی (حریم خصوصی و قوانین) پیش‌نویس است و پیش از انتشار عمومی باید توسط مشاور حقوقی بررسی شود.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">صفحه</th><th scope="col">وضعیت بازبینی</th><th scope="col">آخرین ویرایش</th></tr></thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.slug}>
                <td><Link href={`/admin/content/${p.slug}`}>{p.title}</Link></td>
                <td>{p.needsReview ? <Badge tone="warning">نیاز به بازبینی</Badge> : <Badge tone="success">بازبینی‌شده</Badge>}</td>
                <td className="num small">{formatDateTime(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
