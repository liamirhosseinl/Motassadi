"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { faDigits } from "@/lib/format";

type NavItem = { href: string; label: string };

function arrowSvg(size = 18) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 7L7 17 M8 7h9v9" /></svg>
  );
}

/** Fixed header: transparent over the home hero, frosted navy once the page scrolls; full-screen menu on small screens. */
export function SiteHeader({ nav, name, phone, logo }: { nav: NavItem[]; name: string; phone: string; logo: string }) {
  const path = usePathname();
  const overHero = path === "/";
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const lastY = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      setHidden(y > 400 && y > lastY.current + 4);
      if (y < lastY.current - 4) setHidden(false);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => {
    const [p, q] = href.split("?");
    if (q) return false;
    return p === "/" ? path === "/" : path.startsWith(p);
  };
  const solid = !overHero || scrolled || open;
  const tel = phone.replace(/[^\d+]/g, "");

  return (
    <>
      <header className={`site-header ${solid ? "is-solid" : "is-over"} ${hidden && !open ? "is-hidden" : ""}`}>
        <div className="container bar">
          <Link href="/" className="logo" aria-label={`${name} — صفحهٔ اصلی`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={name} width={180} height={44} />
          </Link>
          <nav className="site-nav" aria-label="ناوبری اصلی">
            {nav.map((n) => <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}>{n.label}</Link>)}
          </nav>
          <div className="header-actions">
            <a className="btn btn-primary btn-arrow header-cta" href={`tel:${tel}`}>
              <span className="ph" dir="ltr">{faDigits(phone)}</span>
              <span className="disc" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
              </span>
            </a>
            <button ref={btnRef} type="button" className="icon-btn menu-btn" aria-expanded={open} aria-controls="site-menu" aria-label={open ? "بستن منو" : "منو"} onClick={() => setOpen((o) => !o)}>
              <span className="bars" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <div id="site-menu" className={`menu-overlay ${open ? "open" : ""}`} aria-hidden={!open} {...(!open ? { inert: true } : {})}>
        <nav aria-label="ناوبری موبایل">
          {nav.map((n, i) => (
            <Link key={n.href} href={n.href} style={{ "--i": i } as React.CSSProperties} onClick={() => setOpen(false)}>
              {n.label}<small>{faDigits(String(i + 1).padStart(2, "0"))}</small>
            </Link>
          ))}
        </nav>
        <div className="menu-foot">
          <span>{name}</span>
          <a className="btn btn-primary btn-arrow" href={`tel:${tel}`} style={{ alignSelf: "flex-start" }}>
            تماس: <span dir="ltr" style={{ fontFamily: "var(--font-num)" }}>{faDigits(phone)}</span>
            <span className="disc">{arrowSvg(16)}</span>
          </a>
        </div>
      </div>
    </>
  );
}

/** Reveal-on-scroll for any [data-reveal] element; content stays visible without JS (the .js class gates the hidden state). */
export function MotionRoot() {
  const path = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    // Count-up numbers
    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    const cio = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target as HTMLElement; cio.unobserve(el);
        const target = Number(el.dataset.count); if (!Number.isFinite(target)) continue;
        const t0 = performance.now(); const dur = 1400;
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / dur); const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
          el.textContent = faDigits(v); if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    counters.forEach((c) => cio.observe(c));
    return () => { io.disconnect(); cio.disconnect(); };
  }, [path]);
  return null;
}

export function BackToTop() {
  return (
    <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      بازگشت به بالا
      <span className="disc" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5 M6 11l6-6 6 6" /></svg>
      </span>
    </button>
  );
}
