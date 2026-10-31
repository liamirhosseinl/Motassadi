import Link from "next/link";

export const metadata = { title: "دسترسی ندارید", robots: { index: false } };

export default function Forbidden() {
  return (
    <main id="main" className="container section">
      <div className="empty" role="alert">
        <h1 style={{ fontSize: 24 }}>به این بخش دسترسی ندارید</h1>
        <p className="muted">اگر برای کارتان لازم است، از مدیر بخواهید دسترسی لازم را به نقش شما اضافه کند.</p>
        <Link href="/admin" className="btn btn-navy">بازگشت به داشبورد</Link>
      </div>
    </main>
  );
}
