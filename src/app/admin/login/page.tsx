import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { Mark } from "@/components/ui";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { login } from "./actions";

export const metadata: Metadata = { title: "ورود کارکنان", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const changed = (await searchParams).changed === "1";
  return (
    <main id="main" className="login-shell">
      <div className="login-pane">
        <div className="login-card">
          <div className="row" style={{ gap: 12 }}>
            <Mark size={48} />
            <div className="stack" style={{ gap: 0 }}>
              <strong style={{ fontSize: 18, color: "var(--navy)" }}>املاک متصدی</strong>
              <span className="small muted">پنل مدیریت دفتر</span>
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h1>ورود کارکنان</h1>
            <p className="muted small">با نام کاربری و رمز عبوری که مدیر سامانه به شما داده وارد شوید.</p>
          </div>
          {changed && <div className="alert alert-success" role="status">رمز تغییر کرد. با رمز جدید وارد شوید.</div>}
          <ActionForm action={login} className="stack">
            <TextField label="نام کاربری" name="username" autoComplete="username" required dir="ltr" className="" />
            <TextField label="رمز عبور" name="password" type="password" autoComplete="current-password" required dir="ltr" />
            <SubmitButton className="btn btn-navy btn-lg" pendingText="در حال ورود…">ورود</SubmitButton>
          </ActionForm>
          <p className="tiny muted">رمز عبور را فراموش کرده‌اید؟ مدیر سامانه می‌تواند از بخش «کاربران» رمز تازه تعیین کند. (راهنمای بازیابی مدیر در مستندات پروژه آمده است.)</p>
        </div>
      </div>
      <div className="login-art" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/site/login.jpg" alt="" width={2400} height={1600} />
        <span className="kicker kicker-light">املاک متصدی · زرند</span>
        <h2>همهٔ کارهای دفتر، <span className="accent">یک‌جا.</span></h2>
        <p>املاک، درخواست‌ها، پیگیری‌ها، معاملات و حساب‌ها.</p>
      </div>
    </main>
  );
}
