import { z } from "zod";
import type { Permission, Role } from "../auth/permissions";
import { enDigits, normalizePhone, parseIntSafe, parseJalaliDate, parseMoney } from "@/lib/format";

export type Actor = { id: number; role: Role; permissions: Set<Permission> };

export class ServiceError extends Error {
  constructor(message: string, public fieldErrors?: Record<string, string>) { super(message); }
}
export class PermissionError extends ServiceError {
  constructor(public permission: Permission) { super("شما اجازهٔ انجام این کار را ندارید."); }
}

export function assertCan(actor: Actor, ...perms: Permission[]) {
  for (const p of perms) if (!actor.permissions.has(p)) throw new PermissionError(p);
}

export type ActionResult = { ok: boolean; message?: string; fieldErrors?: Record<string, string>; redirectTo?: string };

/* ───── zod preprocessors for HTML form strings ───── */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const zText = (max = 500) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1, "این فیلد الزامی است.").max(max, `حداکثر ${max} نویسه.`));
export const zOptText = (max = 5000) => z.preprocess((v) => { const b = blankToNull(v); return typeof b === "string" ? b.trim() : b; }, z.string().max(max, `حداکثر ${max} نویسه.`).nullable().optional().transform((v) => v ?? null));

export const zMoney = z.preprocess((v) => (v === null || v === undefined ? null : parseMoney(String(v))), z.number({ invalid_type_error: "مبلغ معتبر نیست." }).int().min(0, "مبلغ نمی‌تواند منفی باشد.").max(1e15, "مبلغ بیش از حد بزرگ است.").nullable());
export const zMoneyRequired = z.preprocess((v) => (v === null || v === undefined ? null : parseMoney(String(v))), z.number({ invalid_type_error: "مبلغ معتبر نیست.", required_error: "مبلغ را وارد کنید." }).int().min(1, "مبلغ باید بیشتر از صفر باشد.").max(1e15, "مبلغ بیش از حد بزرگ است."));

export const zInt = (min = 0, max = 1_000_000) => z.preprocess((v) => (v === null || v === undefined ? null : parseIntSafe(String(v))), z.number({ invalid_type_error: "عدد معتبر نیست." }).int().min(min, `حداقل ${min}.`).max(max, `حداکثر ${max}.`).nullable());
export const zId = z.preprocess((v) => (v === null || v === undefined || v === "" ? null : parseIntSafe(String(v))), z.number().int().positive().nullable());
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());
export const zPhone = z.preprocess((v) => (typeof v === "string" ? normalizePhone(v) ?? "__invalid__" : v), z.string().regex(/^0\d{10}$/, "شمارهٔ تماس معتبر نیست؛ ۱۱ رقم با صفر اول وارد کنید."));
export const zOptPhone = z.preprocess((v) => { const b = blankToNull(v); if (b === null || b === undefined) return null; return normalizePhone(String(b)) ?? "__invalid__"; }, z.string().regex(/^0\d{10}$/, "شمارهٔ تماس معتبر نیست.").nullable());
/** Jalali date input → ISO Gregorian date string. */
export const zJalaliDate = z.preprocess((v) => { const r = parseJalaliDate(typeof v === "string" ? v : null); return r === undefined ? "__invalid__" : r; }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ را به شکل ۱۴۰۵/۰۸/۰۹ وارد کنید.").nullable());
export const zJalaliDateRequired = zJalaliDate.refine((v) => v !== null, "تاریخ الزامی است.");
export const zEnum = <const T extends readonly [string, ...string[]]>(values: T, msg = "گزینهٔ معتبر نیست.") =>
  z.enum(values as unknown as [T[number], ...T[number][]], { errorMap: () => ({ message: msg }) });

export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] = (out[key] as string[] | undefined) ?? []);
      (out[key] as string[]).push(v);
    } else out[k] = v;
  }
  return out;
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw new ServiceError("لطفاً خطاهای فرم را برطرف کنید.", fieldErrors);
  }
  return r.data;
}

/** Search text: Persian/Arabic letter variants and digits normalised. */
export function normalizeSearch(q: string | null | undefined): string {
  if (!q) return "";
  return enDigits(q).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

export const PAGE_SIZE = 20;
export function pageParam(v: unknown): number {
  const n = parseIntSafe(typeof v === "string" ? v : null);
  return n && n > 0 && n < 100000 ? n : 1;
}
