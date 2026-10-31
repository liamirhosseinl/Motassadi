import { eq } from "drizzle-orm";
import type { DB } from "./index";
import * as s from "./schema";
import { DEFAULT_GRANTS, type Role } from "../auth/permissions";
import { DEFAULT_SETTINGS } from "../services/settings-defaults";
import { DEFAULT_PAGES } from "../services/content-defaults";

const BOOTSTRAP_VERSION = 1;

/**
 * Idempotent first-run setup. Reference data (categories, permissions, pages) is seeded once,
 * guarded by a version flag, so later edits by the owner are never overwritten.
 * Missing settings keys are always filled with defaults.
 * No properties, contacts or financial records are created here.
 */
export async function bootstrap(db: DB) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(s.settings).values({ key, value }).onConflictDoNothing();
  }
  const [flag] = await db.select().from(s.settings).where(eq(s.settings.key, "system.bootstrapVersion"));
  if (flag && Number(flag.value) >= BOOTSTRAP_VERSION) return;

  await db.transaction(async (tx) => {
    for (const [role, perms] of Object.entries(DEFAULT_GRANTS) as [Role, string[]][]) {
      for (const permission of perms) {
        await tx.insert(s.rolePermissions).values({ role, permission }).onConflictDoNothing();
      }
    }
    const cats = [
      { slug: "apartment", name: "آپارتمان", hasRooms: true },
      { slug: "house", name: "خانهٔ ویلایی", hasRooms: true },
      { slug: "land", name: "زمین", hasRooms: false },
      { slug: "garden", name: "باغ", hasRooms: false },
      { slug: "villa", name: "ویلا و باغ‌ویلا", hasRooms: true },
      { slug: "commercial", name: "تجاری و مغازه", hasRooms: false },
      { slug: "other", name: "سایر", hasRooms: false },
    ];
    for (const [i, c] of cats.entries()) await tx.insert(s.propertyCategories).values({ ...c, sort: i }).onConflictDoNothing();

    const features = ["پارکینگ", "انباری", "آسانسور", "حیاط", "سند تک‌برگ", "گاز", "آب", "برق", "تلفن", "سیستم گرمایش", "کولر", "بالکن", "چاه آب", "سهم آب کشاورزی", "دیوارکشی", "نزدیک خیابان اصلی"];
    for (const [i, name] of features.entries()) await tx.insert(s.propertyFeatures).values({ name, sort: i }).onConflictDoNothing();

    const income = [
      { name: "کمیسیون فروش", isCommission: true },
      { name: "کمیسیون اجاره", isCommission: true },
      { name: "سایر درآمدها", isCommission: false },
    ];
    const expense = ["اجارهٔ دفتر", "قبوض و انرژی", "تبلیغات و بازاریابی", "لوازم اداری", "حقوق و دستمزد", "رفت‌وآمد", "تعمیرات و نگهداری", "نرم‌افزار و اشتراک‌ها", "سایر هزینه‌ها"];
    for (const [i, c] of income.entries()) await tx.insert(s.financeCategories).values({ kind: "income", ...c, sort: i }).onConflictDoNothing();
    for (const [i, name] of expense.entries()) await tx.insert(s.financeCategories).values({ kind: "expense", name, sort: i }).onConflictDoNothing();
    await tx.insert(s.financeCategories).values({ kind: "expense", name: "استرداد یا تعدیل کمیسیون", isCommission: true, sort: expense.length }).onConflictDoNothing();

    for (const p of DEFAULT_PAGES) await tx.insert(s.contentPages).values(p).onConflictDoNothing();

    await tx.insert(s.settings).values({ key: "system.bootstrapVersion", value: BOOTSTRAP_VERSION })
      .onConflictDoUpdate({ target: s.settings.key, set: { value: BOOTSTRAP_VERSION } });
  });
}
