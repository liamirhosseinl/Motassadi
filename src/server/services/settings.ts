import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, type DBorTx } from "../db";
import * as s from "../db/schema";
import { DEFAULT_SETTINGS, type SettingsMap, type SettingsKey } from "./settings-defaults";
import { z } from "zod";
import { assertCan, parseOrThrow, ServiceError, zEnum, zPhone, zText, type Actor } from "./common";
import { enDigits } from "@/lib/format";
import { audit } from "./infra";

export async function readSettings(db: DBorTx): Promise<SettingsMap> {
  const rows = await db.select().from(s.settings);
  const merged = structuredClone(DEFAULT_SETTINGS) as SettingsMap;
  for (const row of rows) {
    if (row.key in merged) {
      const key = row.key as SettingsKey;
      (merged as Record<string, unknown>)[key] = { ...(DEFAULT_SETTINGS[key] as object), ...(row.value as object) };
    }
  }
  return merged;
}

/** Request-cached settings for pages. */
export const getSettings = cache(async () => readSettings(await getDb()));

export async function writeSetting<K extends SettingsKey>(db: DBorTx, actor: Actor, key: K, value: SettingsMap[K]) {
  assertCan(actor, "settings.manage");
  await db.insert(s.settings).values({ key, value, updatedBy: actor.id })
    .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedBy: actor.id, updatedAt: new Date() } });
  await audit(db, actor.id, "settings.update", "settings", key, { value });
}

export async function getSettingRaw(db: DBorTx, key: string) {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, key));
  return row?.value;
}

/* ───── Settings form (one group per form) ───── */

const prefix = z.string().trim().regex(/^[A-Z]{1,3}$/, "۱ تا ۳ حرف بزرگ لاتین، مثلاً M");
const handle = z.string().trim().max(120).regex(/^$|^[A-Za-z0-9_.@:/\-]+$/, "فقط نام کاربری یا نشانی لاتین");
const optPercent = z.preprocess((v) => {
  const str = enDigits(String(v ?? "")).replace("٫", ".").trim();
  return str === "" ? null : Number(str);
}, z.number({ invalid_type_error: "عدد وارد کنید." }).min(0).max(50).nullable());
const on = z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean());

export const settingsSchemas = {
  business: z.object({
    name: zText(80), ownerName: zText(120), address: zText(250), phone: zPhone, whatsapp: zPhone,
    city: zText(60), province: zText(60),
  }),
  site: z.object({ tagline: zText(120), description: zText(300) }),
  social: z.object({ instagram: handle, telegram: handle }),
  currency: z.object({ display: zEnum(["toman", "rial"]) }),
  refs: z.object({ propertyPrefix: prefix, transactionPrefix: prefix }),
  publishing: z.object({ requireImage: on, requireDescription: on }),
  commission: z.object({ defaultRatePercent: optPercent }),
  privacy: z.object({ inquiryNotice: zText(500) }),
} as const;
export type SettingsGroup = keyof typeof settingsSchemas;

export async function saveSettingsGroup(db: DBorTx, actor: Actor, group: string, raw: Record<string, unknown>) {
  assertCan(actor, "settings.manage");
  if (!(group in settingsSchemas)) throw new ServiceError("بخش تنظیمات نامعتبر است.");
  const g = group as SettingsGroup;
  const value = parseOrThrow(settingsSchemas[g] as z.ZodTypeAny, raw);
  if (g === "refs" && value.propertyPrefix === value.transactionPrefix) {
    throw new ServiceError("پیشوند ملک و معامله باید متفاوت باشد.", { transactionPrefix: "تکراری" });
  }
  await writeSetting(db, actor, g, value as never);
}
