"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { faDigits } from "@/lib/format";
import { Icon, type IconName } from "@/components/ui";

const ICON_FOR: Record<string, IconName> = {
  "/admin": "grid",
  "/admin/properties": "home",
  "/admin/inquiries": "inbox",
  "/admin/contacts": "users",
  "/admin/followups": "clock",
  "/admin/transactions": "handshake",
  "/admin/finance": "wallet",
  "/admin/reports": "chart",
  "/admin/content": "pages",
  "/admin/settings": "settings",
  "/admin/users": "shield",
  "/admin/audit": "log",
};

export function AdminNav({ items }: { items: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="بخش‌های پنل">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
            <span className="ic"><Icon name={ICON_FOR[i.href] ?? "layers"} size={18} /></span>
            {i.label}
            {i.count ? <span className="count" aria-label={`${faDigits(i.count)} مورد`}>{faDigits(i.count)}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar shell: fixed column on desktop, slide-in drawer with scrim on smaller screens. */
export function AdminChrome({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) { setOpen(false); btn.current?.focus(); }
      // "/" focuses the global search, like most dashboards
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        const q = document.getElementById("admin-q") as HTMLInputElement | null;
        if (q && q.offsetParent !== null) { e.preventDefault(); q.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="admin-shell">
      <a href="#admin-main" className="skip-link">پرش به محتوا</a>
      <aside className={`admin-sidebar ${open ? "open" : ""}`} aria-label="منوی پنل">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/motasadi_logo-horizontal_reverse.svg" alt="املاک متصدی" width={150} height={38} style={{ width: "auto" }} />
          <button type="button" className="icon-btn close" style={{ width: 40, height: 40 }} aria-label="بستن منو" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
        </div>
        {sidebar}
      </aside>
      <div className={`admin-scrim ${open ? "open" : ""}`} aria-hidden="true" onClick={() => setOpen(false)} />
      <div style={{ minWidth: 0 }}>
        <div className="admin-topbar">
          <button ref={btn} type="button" className="menu-btn" aria-label="منوی پنل" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={20} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/motasadi_logo-horizontal_color.svg" alt="املاک متصدی" width={130} height={32} style={{ width: "auto" }} />
          <Link href="/admin/search" className="menu-btn" style={{ marginInlineStart: "auto" }} aria-label="جست‌وجوی سراسری"><Icon name="search" size={19} /></Link>
        </div>
        <main id="admin-main" className="admin-main" key={path}>{children}</main>
      </div>
    </div>
  );
}
