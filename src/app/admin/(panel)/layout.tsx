import type { Metadata } from "next";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { requirePage } from "@/server/auth/session";
import { ROLES } from "@/server/auth/permissions";
import { AdminChrome, AdminNav } from "./nav";
import { Icon } from "@/components/ui";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: { default: "پنل مدیریت", template: "%s | پنل املاک متصدی" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("dashboard.view");
  const db = await getDb();
  const [newInq] = user.permissions.has("inquiries.view")
    ? await db.select({ n: sql<number>`count(*)::int` }).from(s.inquiries).where(eq(s.inquiries.status, "new"))
    : [{ n: 0 }];
  const [overdue] = user.permissions.has("followups.manage")
    ? await db.select({ n: sql<number>`count(*)::int` }).from(s.followups).where(and(eq(s.followups.done, false), lt(s.followups.dueAt, new Date())))
    : [{ n: 0 }];
  const p = (x: string) => user.permissions.has(x as never);
  const items = [
    { href: "/admin", label: "داشبورد", show: true },
    { href: "/admin/properties", label: "املاک", show: p("properties.view") },
    { href: "/admin/inquiries", label: "درخواست‌ها", show: p("inquiries.view"), count: newInq.n },
    { href: "/admin/contacts", label: "مخاطبان", show: p("contacts.view") },
    { href: "/admin/followups", label: "پیگیری‌ها", show: p("followups.manage"), count: overdue.n },
    { href: "/admin/transactions", label: "معاملات", show: p("transactions.view") },
    { href: "/admin/finance", label: "دریافت و هزینه", show: p("finance.view") },
    { href: "/admin/reports", label: "گزارش‌ها", show: p("reports.view") },
    { href: "/admin/content", label: "صفحات سایت", show: p("content.manage") },
    { href: "/admin/settings", label: "تنظیمات", show: p("settings.manage") },
    { href: "/admin/users", label: "کاربران و دسترسی", show: p("users.manage") },
    { href: "/admin/audit", label: "گزارش رویدادها", show: p("audit.view") },
  ].filter((i) => i.show);
  const initial = user.name.trim().charAt(0) || "؟";
  return (
    <AdminChrome sidebar={
      <>
        <form method="get" action="/admin/search" role="search" className="admin-search">
          <label htmlFor="admin-q" className="sr-only">جست‌وجوی سراسری</label>
          <Icon name="search" size={17} />
          <input id="admin-q" name="q" type="search" className="input" placeholder="جست‌وجو: کد، نام، شماره…" minLength={2} maxLength={100} />
          <kbd aria-hidden="true">/</kbd>
        </form>
        <span className="nav-label">منوی اصلی</span>
        <AdminNav items={items.map(({ href, label, count }) => ({ href, label, count }))} />
        <div className="admin-user">
          <div className="who">
            <span className="avatar" aria-hidden="true">{initial}</span>
            <span><strong>{user.name}</strong><span>{ROLES[user.role]}</span></span>
          </div>
          <div className="acts">
            <a href="/admin/account" className="btn btn-sm"><Icon name="user" size={15} />حساب من</a>
            <a href="/" className="btn btn-sm" target="_blank"><Icon name="external" size={15} />سایت</a>
            <form action={logout}><button type="submit" className="btn btn-sm logout"><Icon name="logout" size={15} />خروج</button></form>
          </div>
        </div>
      </>
    }>
      {children}
    </AdminChrome>
  );
}
