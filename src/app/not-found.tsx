import Link from "next/link";
import { Icon } from "@/components/ui";

export const metadata = { title: "صفحه پیدا نشد", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="on-dark" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div className="stack" style={{ alignItems: "center", gap: 18, maxWidth: 560 }}>
        <span className="outline-num" style={{ fontSize: "clamp(110px, 22vw, 220px)", color: "var(--amber)" }}>۴۰۴</span>
        <h1 style={{ fontSize: "clamp(26px, 4vw, 40px)", color: "var(--cream)" }}>این صفحه پیدا نشد</h1>
        <p>ممکن است آگهی برداشته شده یا نشانی اشتباه وارد شده باشد.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href="/properties" className="btn btn-primary btn-arrow">مشاهدهٔ املاک<span className="disc"><Icon name="arrow" size={16} /></span></Link>
          <Link href="/" className="btn btn-light">صفحهٔ اصلی</Link>
        </div>
      </div>
    </main>
  );
}
