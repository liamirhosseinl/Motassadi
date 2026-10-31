/**
 * Display & parsing policy (one place, used everywhere):
 * - Digits are rendered in Persian (۰–۹) in the UI; stored and exported values use Latin digits.
 * - Money is stored as integer TOMAN. Display unit follows the `currency.display` setting
 *   (toman, or rial = toman × 10) and is always labelled.
 * - Timestamps are stored in UTC and rendered as Jalali dates in the office time zone (Asia/Tehran).
 * - Calendar-only dates are stored as ISO "YYYY-MM-DD" (Gregorian) and entered/rendered as Jalali.
 */
import { toGregorian, toJalali, isValidJalali, JALALI_MONTHS } from "./jalali";

export const APP_TIMEZONE = "Asia/Tehran";
const FA = "۰۱۲۳۴۵۶۷۸۹";
const AR = "٠١٢٣٤٥٦٧٨٩";

export function faDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

export function enDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)));
}

export function groupDigits(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  return (neg ? "−" : "") + s;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return faDigits(groupDigits(n));
}

export type CurrencyDisplay = "toman" | "rial";

/** amountToman is the stored value. */
export function formatMoney(amountToman: number | null | undefined, display: CurrencyDisplay = "toman"): string {
  if (amountToman === null || amountToman === undefined) return "—";
  const v = display === "rial" ? amountToman * 10 : amountToman;
  return `${formatNumber(v)} ${display === "rial" ? "ریال" : "تومان"}`;
}

/** Short public form: ۴٫۸۵ میلیارد تومان / ۴۸٫۵ میلیارد ریال. Input is always toman; rial = toman × 10. */
export function formatMoneyShort(amountToman: number | null | undefined, display: CurrencyDisplay = "toman"): string {
  if (amountToman === null || amountToman === undefined) return "—";
  const amount = display === "rial" ? amountToman * 10 : amountToman;
  const unit = display === "rial" ? "ریال" : "تومان";
  const units: [number, string][] = [[1e9, "میلیارد"], [1e6, "میلیون"], [1e3, "هزار"]];
  for (const [u, label] of units) {
    if (amount >= u) {
      const v = Math.round((amount / u) * 100) / 100;
      const str = String(v).replace(".", "٫");
      return `${faDigits(str)} ${label} ${unit}`;
    }
  }
  return `${formatNumber(amount)} ${unit}`;
}

/** Splits a short money string into number / scale word / unit so the UI can keep them on one line. */
export function moneyParts(amountToman: number | null | undefined, display: CurrencyDisplay = "toman"): { num: string; scale: string; unit: string } | null {
  if (amountToman === null || amountToman === undefined) return null;
  const amount = display === "rial" ? amountToman * 10 : amountToman;
  const unit = display === "rial" ? "ریال" : "تومان";
  const units: [number, string][] = [[1e9, "میلیارد"], [1e6, "میلیون"], [1e3, "هزار"]];
  for (const [u, label] of units) {
    if (amount >= u) {
      const v = Math.round((amount / u) * 100) / 100;
      return { num: faDigits(String(v).replace(".", "٫")), scale: label, unit };
    }
  }
  return { num: formatNumber(amount), scale: "", unit };
}

/** Parses user money input (Persian/Latin digits, separators). Returns null for empty, NaN for invalid. */
export function parseMoney(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = enDigits(String(input)).replace(/[\s,٬،_]/g, "").trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return Number.NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

export function parseIntSafe(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = enDigits(String(input)).replace(/[\s,٬]/g, "").trim();
  if (s === "") return null;
  if (!/^-?\d+$/.test(s)) return Number.NaN;
  return Number(s);
}

/* ───── Phone ───── */

/** Normalises to 11-digit national format (0XXXXXXXXXX). Returns null when invalid. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = enDigits(input).replace(/[^\d+]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.length === 10 && s.startsWith("9")) s = "0" + s;
  return /^0\d{10}$/.test(s) ? s : null;
}

export function phoneDisplay(phone: string | null | undefined): string {
  return phone ? faDigits(phone) : "—";
}

export function whatsappLink(phone: string): string {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/98${n.slice(1)}` : "#";
}

/* ───── Dates ───── */

function tehranParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO "YYYY-MM-DD" (Gregorian calendar date) → "۱۴۰۵/۰۸/۰۹". */
export function isoDateToJalali(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const j = toJalali(y, m, d);
  return faDigits(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);
}

export function isoDateToJalaliLatin(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const j = toJalali(y, m, d);
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

export function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const p = tehranParts(new Date(ts));
  const j = toJalali(p.y, p.m, p.d);
  return faDigits(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);
}

export function formatDateLong(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const p = tehranParts(new Date(ts));
  const j = toJalali(p.y, p.m, p.d);
  return faDigits(`${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`);
}

export function formatDateTime(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const p = tehranParts(new Date(ts));
  const j = toJalali(p.y, p.m, p.d);
  return faDigits(`${j.jy}/${pad(j.jm)}/${pad(j.jd)} ساعت ${pad(p.h)}:${pad(p.min)}`);
}

/** Today in Tehran as ISO date. */
export function todayIso(now = new Date()): string {
  const p = tehranParts(now);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function currentJalaliYear(now = new Date()): number {
  const p = tehranParts(now);
  return toJalali(p.y, p.m, p.d).jy;
}

/** "۱۴۰۵/۸/۹" or "1405-08-09" → ISO Gregorian "2026-10-31". Returns null if empty, undefined if invalid. */
export function parseJalaliDate(input: string | null | undefined): string | null | undefined {
  if (!input || !input.trim()) return null;
  const m = enDigits(input.trim()).match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return undefined;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!isValidJalali(jy, jm, jd)) return undefined;
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

/** Jalali date + "HH:MM" in Tehran time → UTC Date. Tehran is UTC+03:30 (no DST since 1401). */
export function parseJalaliDateTime(dateInput: string | null | undefined, timeInput: string | null | undefined): Date | null | undefined {
  const iso = parseJalaliDate(dateInput);
  if (iso === null || iso === undefined) return iso;
  const t = enDigits((timeInput ?? "").trim() || "09:00").match(/^(\d{1,2}):(\d{2})$/);
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return undefined;
  return new Date(`${iso}T${pad(Number(t[1]))}:${t[2]}:00+03:30`);
}

export function timeOfDay(ts: Date | string | null | undefined): string {
  if (!ts) return "";
  const p = tehranParts(new Date(ts));
  return `${pad(p.h)}:${pad(p.min)}`;
}

/** Jalali month range [startIso, endIsoExclusive] for reports. */
export function jalaliMonthRange(jy: number, jm: number): [string, string] {
  const s = toGregorian(jy, jm, 1);
  const ny = jm === 12 ? jy + 1 : jy;
  const nm = jm === 12 ? 1 : jm + 1;
  const e = toGregorian(ny, nm, 1);
  return [`${s.gy}-${pad(s.gm)}-${pad(s.gd)}`, `${e.gy}-${pad(e.gm)}-${pad(e.gd)}`];
}

export function jalaliOf(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return toJalali(y, m, d);
}

export { JALALI_MONTHS };
