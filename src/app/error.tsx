"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="container section" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="empty" role="alert" style={{ maxWidth: 560, width: "100%" }}>
        <h1 style={{ fontSize: 26 }}>مشکلی پیش آمد</h1>
        <p className="muted">صفحه بارگذاری نشد. دوباره تلاش کنید؛ اگر مشکل ادامه داشت با دفتر تماس بگیرید.</p>
        <button type="button" className="btn btn-primary" onClick={reset}>تلاش دوباره</button>
      </div>
    </main>
  );
}
