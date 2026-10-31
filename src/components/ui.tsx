import Link from "next/link";
import type { ReactNode } from "react";
import { faDigits, formatMoney, formatNumber, moneyParts, type CurrencyDisplay } from "@/lib/format";
import { PROPERTY_STATUSES, DEAL_TYPES, INQUIRY_STATUSES, TX_STATUSES, PAYMENT_STATES } from "@/lib/vocab";



export function Mark({ size = 40, stroke = "#1A3263", sun = "#FFC570", label }: { size?: number; stroke?: string; sun?: string; label?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx="76" cy="22" r="9" fill={sun} />
      <path d="M8 86H92 M20 86V53L50 26L80 53V86" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M43 86V71a7 7 0 0 1 14 0V86z" fill={stroke} />
    </svg>
  );
}

export type Tone = "amber" | "navy" | "steel" | "success" | "warning" | "error" | "info" | "muted";
export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

const propertyTone: Record<string, Tone> = { draft: "muted", pending_review: "warning", published: "success", reserved: "info", sold: "navy", rented: "navy", unpublished: "muted", archived: "muted" };
export function PropertyStatusBadge({ status }: { status: string }) {
  return <Badge tone={propertyTone[status] ?? "muted"}>{PROPERTY_STATUSES[status as keyof typeof PROPERTY_STATUSES] ?? status}</Badge>;
}
const inquiryTone: Record<string, Tone> = { new: "amber", contacted: "info", follow_up: "warning", visit_scheduled: "info", negotiation: "warning", converted: "success", closed: "muted", not_interested: "muted" };
export function InquiryStatusBadge({ status }: { status: string }) {
  return <Badge tone={inquiryTone[status] ?? "muted"}>{INQUIRY_STATUSES[status as keyof typeof INQUIRY_STATUSES] ?? status}</Badge>;
}
const txTone: Record<string, Tone> = { draft: "muted", pending: "warning", completed: "success", cancelled: "error" };
export function TxStatusBadge({ status }: { status: string }) {
  return <Badge tone={txTone[status] ?? "muted"}>{TX_STATUSES[status as keyof typeof TX_STATUSES] ?? status}</Badge>;
}
const payTone: Record<string, Tone> = { none: "muted", unpaid: "error", partial: "warning", paid: "success" };
export function PaymentBadge({ state }: { state: keyof typeof PAYMENT_STATES }) {
  return <Badge tone={payTone[state]}>{PAYMENT_STATES[state]}</Badge>;
}
export function DealBadge({ deal }: { deal: string }) {
  return <Badge tone={deal === "sale" ? "amber" : "navy"}>{DEAL_TYPES[deal as keyof typeof DEAL_TYPES] ?? deal}</Badge>;
}

export function Money({ value, display = "toman" }: { value: number | null | undefined; display?: CurrencyDisplay }) {
  // RTL isolate: reads "۳۰۰٬۰۰۰ تومان" right-to-left (amount, then unit) without reordering neighbours.
  return <bdi dir="rtl" className="money">{formatMoney(value, display)}</bdi>;
}
export function Num({ value }: { value: number | null | undefined }) {
  return <bdi className="num">{formatNumber(value)}</bdi>;
}
/** Phone/reference values are LTR runs inside RTL text; bdi keeps digit groups in order. */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr" className="ltr">{typeof children === "string" ? faDigits(children) : children}</bdi>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Mark size={52} stroke="#E6D6C0" sun="#FFE2B3" />
      <strong style={{ fontSize: 19, color: "var(--navy)" }}>{title}</strong>
      {children && <div className="muted">{children}</div>}
      {action}
    </div>
  );
}

/** Server-rendered pagination preserving the current query string. */
export function Pagination({ page, total, pageSize, basePath, params }: {
  page: number; total: number; pageSize: number; basePath: string; params: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined || v === "") continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x));
    }
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="صفحه‌بندی">
      {page > 1 && <Link href={href(page - 1)} rel="prev">قبلی</Link>}
      {sorted.map((n, i) => (
        <span key={n} style={{ display: "contents" }}>
          {i > 0 && n - sorted[i - 1] > 1 && <span aria-hidden="true">…</span>}
          {n === page ? <span aria-current="page">{faDigits(n)}</span> : <Link href={href(n)}>{faDigits(n)}</Link>}
        </span>
      ))}
      {page < pages && <Link href={href(page + 1)} rel="next">بعدی</Link>}
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="مسیر صفحه" className="breadcrumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <span aria-hidden="true">‹</span>}
          {it.href && i < items.length - 1 ? <Link href={it.href}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

const ICONS = {
  area: "M4 4h16v16H4z M9 15l6-6 M11 9h4v4",
  bed: "M3 19V6 M3 15h18v4 M3 11h7v4 M21 15v-2a2 2 0 0 0-2-2h-9",
  bath: "M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M6 12V5a2 2 0 0 1 4 0 M7 20l-1 2 M17 20l1 2",
  floor: "M3 20h5v-5h5v-5h5V5h3",
  pin: "M12 21s-7-6.5-7-11.5a7 7 0 0 1 14 0C19 14.5 12 21 12 21z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  calendar: "M3 5h18v15H3z M3 10h18 M8 2v5 M16 2v5",
  doc: "M5 3h10l4 4v14H5z M15 3v4h4 M8 12h8 M8 16h8",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5L21 21",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  "chevron-l": "M15 5l-7 7 7 7",
  "chevron-r": "M9 5l7 7-7 7",
  "chevron-d": "M6 9l6 6 6-6",
  "chevron-u": "M6 15l6-6 6 6",
  arrow: "M17 7L7 17 M8 7h9v9",
  "arrow-l": "M19 12H5 M11 6l-6 6 6 6",
  whatsapp: "M4 20l1.5-4.5A8 8 0 1 1 9 19z M9 9c0 3 3 6 6 6l1.5-1.5-2-1-1 1c-1 0-2.5-1.5-2.5-2.5l1-1-1-2z",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17.5 6.5h.01",
  telegram: "M21 4L3 11l6 2 2 6 3-4 5 4z M9 13l8-6",
  plus: "M12 5v14 M5 12h14",
  download: "M12 3v12 M7 10l5 5 5-5 M4 19h16",
  print: "M7 8V3h10v5 M5 8h14v8h-3v4H8v-4H5z",
  home: "M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6",
  building: "M4 21V5l8-3v19 M12 8h8v13 M7 8h2 M7 12h2 M7 16h2 M15 12h2 M15 16h2 M2 21h20",
  inbox: "M3 13l3-8h12l3 8 M3 13v6h18v-6 M3 13h5l1 3h6l1-3h5",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M17 3.5a4 4 0 0 1 0 7 M22 21a6 6 0 0 0-4-5.6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  handshake: "M2 11l5-5 4 2 3-2 4 1 4 4 M2 11l7 7 2-1 2 2 3-1 4-4 M9 18l3-3 M12 20l2-2 M13 8l-3 3a1.5 1.5 0 0 0 2 2l2-1",
  wallet: "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7l12-4 1 4 M16 14h2",
  chart: "M3 21h18 M6 17V11 M11 17V6 M16 17v-8 M21 17V4",
  pages: "M4 4h11l5 5v11H4z M15 4v5h5 M8 13h8 M8 17h5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.2 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.8 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  log: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  list: "M4 6h16 M4 12h16 M4 18h16",
  check: "M5 12l5 5 9-10",
  close: "M6 6l12 12 M18 6L6 18",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  logout: "M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  key: "M15 9a4 4 0 1 1-3.5 6l-1.5 1.5H8V18H6v2H3v-3l6.5-6.5A4 4 0 0 1 15 9z M16 8h.01",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  calendarCheck: "M3 5h18v15H3z M3 10h18 M8 2v5 M16 2v5 M9 15l2 2 4-4",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Price that never breaks between number, scale word and currency unit. */
export function PriceTag({ value, display = "toman", label, size, className = "" }: { value: number | null | undefined; display?: CurrencyDisplay; label?: string; size?: "sm" | "lg"; className?: string }) {
  const parts = moneyParts(value, display);
  if (!parts) return <span className={`pt call ${size ?? ""} ${className}`}>{label && <span className="pt-l">{label}</span>}<span className="pt-n">تماس بگیرید</span></span>;
  return (
    <span className={`pt ${size ?? ""} ${className}`}>
      {label && <span className="pt-l">{label}</span>}
      <span className="pt-n">{parts.num}</span>
      <span className="pt-u">{parts.scale ? `${parts.scale} ` : ""}{parts.unit}</span>
    </span>
  );
}

/** Plain link for file downloads (CSV, attachments): no client-side navigation or prefetch. */
export function DownloadLink({ href, children, className = "btn btn-outline btn-sm" }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} className={className} download>{children}</a>;
}
