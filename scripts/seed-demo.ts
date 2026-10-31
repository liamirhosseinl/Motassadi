/**
 * DEVELOPMENT / DEMO ONLY. Fills an empty local database with clearly-labelled fictional records
 * so the site and panel can be reviewed with realistic volume. Every title and contact name starts with «نمونه»,
 * phone numbers are fictional (0900…) and neighbourhood names are invented. Photos are free-licence Unsplash images
 * (scripts/demo-photos, credits in docs/photo-credits.md) — illustrative only, not the listed property and never
 * copied from real listings on other sites.
 *
 *   npm run seed:demo                       (requires an owner: run admin:create first)
 *
 * Refuses to run when NODE_ENV=production, against PostgreSQL unless --allow-postgres is given,
 * and on any database that already contains properties.
 */
import { describeDb } from "./_env";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as s from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/server/auth/permissions";
import type { Actor } from "@/server/services/common";
import { addPropertyImage, changePropertyStatus, createProperty } from "@/server/services/properties";
import { createFollowup, createPublicInquiry, createStaffInquiry, saveContact } from "@/server/services/crm";
import { changeTransactionStatus, createFinanceEntry, createTransaction } from "@/server/services/deals";
import { faDigits, isoDateToJalaliLatin, todayIso } from "@/lib/format";
import fs from "node:fs";
import path from "node:path";

const DISCLAIMER = "\n\nاین آگهی نمونه است و فقط برای نمایش ظاهر سایت ساخته شده؛ مشخصات و قیمت ساختگی است و عکس‌ها تصاویر آزاد Unsplash‌اند و به این ملک تعلق ندارند.";
const ALT = "عکس نمونه (Unsplash) — تصویر این ملک نیست";
const PHOTO_DIR = path.join(process.cwd(), "scripts", "demo-photos");
/** Photos for listing #i: scripts/demo-photos/lNN-K.jpg in K order. */
function photosFor(i: number): string[] {
  const prefix = `l${String(i).padStart(2, "0")}-`;
  return fs.readdirSync(PHOTO_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".jpg")).sort((a, b) => Number(a.slice(4, -4)) - Number(b.slice(4, -4))).map((f) => path.join(PHOTO_DIR, f));
}

function daysAgo(n: number) {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDateToJalaliLatin(d.toISOString().slice(0, 10));
}

type Listing = {
  slug: "apartment" | "house" | "villa" | "land" | "garden" | "commercial"; status?: "published" | "draft" | "pending_review" | "reserved" | "sold";
  featured?: boolean; feats?: string[]; data: Record<string, string | undefined>;
};

const LISTINGS: Listing[] = [
  { slug: "apartment", featured: true, feats: ["پارکینگ", "انباری", "آسانسور", "سند تک‌برگ", "گاز", "بالکن"], data: {
    title: "نمونه — آپارتمان ۹۵ متری دو خوابه", dealType: "sale", price: "4850000000", area: "95", bedrooms: "2", bathrooms: "1", floor: "2", totalFloors: "4", buildYear: "1398", neighborhood: "محلهٔ نمونهٔ مرکزی",
    description: "آپارتمان دو خوابه در طبقهٔ دوم یک ساختمان چهار واحدی. نورگیر از جنوب، آشپزخانهٔ اُپن، کف سرامیک و کمدهای دیواری در هر دو اتاق. پارکینگ و انباری اختصاصی دارد." } },
  { slug: "apartment", featured: true, feats: ["پارکینگ", "آسانسور", "سند تک‌برگ", "سیستم گرمایش", "کولر", "بالکن"], data: {
    title: "نمونه — آپارتمان ۱۲۰ متری نوساز سه خوابه", dealType: "sale", price: "6400000000", area: "120", bedrooms: "3", bathrooms: "2", floor: "3", totalFloors: "5", buildYear: "1403", neighborhood: "شهرک نمونهٔ شمالی",
    description: "واحد نوساز با سه اتاق خواب، دو سرویس بهداشتی و پکیج مستقل. ساختمان آسانسور و پارکینگ مسقف دارد. مناسب خانواده‌هایی که فضای بیشتر می‌خواهند." } },
  { slug: "apartment", feats: ["پارکینگ", "گاز", "آب", "برق"], data: {
    title: "نمونه — آپارتمان ۷۵ متری یک خوابه", dealType: "sale", price: "3100000000", area: "75", bedrooms: "1", bathrooms: "1", floor: "1", totalFloors: "3", buildYear: "1394", neighborhood: "محلهٔ نمونهٔ غربی",
    description: "آپارتمان جمع‌وجور یک خوابه با دسترسی آسان به خیابان اصلی؛ گزینه‌ای مناسب برای اولین خرید یا سرمایه‌گذاری اجاره‌ای." } },
  { slug: "apartment", feats: ["پارکینگ", "گاز", "کولر"], data: {
    title: "نمونه — آپارتمان ۷۰ متری برای اجاره", dealType: "rent", deposit: "300000000", rentMonthly: "8000000", area: "70", bedrooms: "1", floor: "1", totalFloors: "3", buildYear: "1396", neighborhood: "محلهٔ نمونهٔ شرقی",
    description: "واحد یک خوابه، تمیز و آمادهٔ تحویل. قابل تبدیل ودیعه و اجاره با توافق موجر." } },
  { slug: "apartment", feats: ["پارکینگ", "آسانسور", "انباری", "سیستم گرمایش"], data: {
    title: "نمونه — آپارتمان ۱۰۵ متری اجاره، طبقهٔ سوم", dealType: "rent", deposit: "450000000", rentMonthly: "12000000", area: "105", bedrooms: "2", bathrooms: "1", floor: "3", totalFloors: "4", buildYear: "1400", neighborhood: "شهرک نمونهٔ شمالی",
    description: "دو خوابهٔ روشن با آشپزخانهٔ بزرگ و بالکن رو به حیاط. ساختمان آسانسور دارد. مناسب خانوادهٔ سه یا چهار نفره." } },
  { slug: "apartment", feats: ["پارکینگ", "گاز"], data: {
    title: "نمونه — آپارتمان ۸۵ متری رهن کامل", dealType: "mortgage", deposit: "900000000", area: "85", bedrooms: "2", floor: "2", totalFloors: "3", buildYear: "1395", neighborhood: "محلهٔ نمونهٔ مرکزی",
    description: "رهن کامل بدون اجارهٔ ماهانه. دو اتاق خواب، کابینت نو و پارکینگ اختصاصی." } },
  { slug: "house", feats: ["حیاط", "سند تک‌برگ", "گاز", "آب", "برق", "انباری"], data: {
    title: "نمونه — خانهٔ ویلایی ۲۰۰ متری حیاط‌دار", dealType: "sale", price: "7200000000", priceNegotiable: "on", area: "200", landArea: "200", buildingArea: "140", bedrooms: "3", bathrooms: "1", buildYear: "1392", neighborhood: "محلهٔ نمونهٔ جنوبی",
    description: "خانهٔ یک طبقه با حیاط ۶۰ متری و درخت‌های میوه. سه اتاق خواب، زیرزمین انباری و امکان ساخت طبقهٔ دوم طبق ضوابط شهرداری (نیازمند استعلام)." } },
  { slug: "house", featured: true, feats: ["حیاط", "پارکینگ", "سند تک‌برگ", "سیستم گرمایش", "کولر"], data: {
    title: "نمونه — خانهٔ ویلایی ۳۰۰ متری دو طبقه", dealType: "sale", price: "9800000000", area: "300", landArea: "300", buildingArea: "260", rooms: "6", bedrooms: "4", bathrooms: "2", totalFloors: "2", buildYear: "1399", neighborhood: "شهرک نمونهٔ شمالی",
    description: "دو طبقهٔ مجزا با ورودی مستقل؛ مناسب سکونت دو خانواده یا یک خانوادهٔ پرجمعیت. پارکینگ دو خودرو و حیاط سنگ‌فرش." } },
  { slug: "house", feats: ["حیاط", "گاز", "آب", "برق"], data: {
    title: "نمونه — خانهٔ ویلایی ۱۸۰ متری برای اجاره", dealType: "rent", deposit: "600000000", rentMonthly: "10000000", area: "180", landArea: "180", buildingArea: "120", bedrooms: "3", buildYear: "1390", neighborhood: "محلهٔ نمونهٔ غربی",
    description: "سه خوابه با حیاط و پارکینگ در کوچه‌ای آرام. نقاشی تازه و آمادهٔ سکونت." } },
  { slug: "villa", featured: true, feats: ["حیاط", "چاه آب", "دیوارکشی", "پارکینگ", "سیستم گرمایش"], data: {
    title: "نمونه — ویلای ۴۵۰ متری با استخر", dealType: "sale", price: "14500000000", area: "450", landArea: "450", buildingArea: "220", bedrooms: "4", bathrooms: "3", buildYear: "1401", neighborhood: "حومهٔ نمونهٔ کوهپایه",
    description: "ویلای چهار خوابه با استخر روباز، آلاچیق و فضای سبز. دیوارکشی کامل و دسترسی آسفالته." } },
  { slug: "villa", feats: ["چاه آب", "دیوارکشی", "برق", "سهم آب کشاورزی"], data: {
    title: "نمونه — باغ‌ویلای ۱۲۰۰ متری", dealType: "sale", price: "9500000000", area: "1200", landArea: "1200", buildingArea: "180", bedrooms: "2", buildYear: "1397", neighborhood: "حومهٔ نمونهٔ کوهپایه",
    description: "باغ‌ویلا با ساختمان ۱۸۰ متری، درختان میوهٔ بارده و سهم آب. مناسب استراحت آخر هفته یا سکونت دائم." } },
  { slug: "land", feats: ["سند تک‌برگ", "برق", "آب", "نزدیک خیابان اصلی"], data: {
    title: "نمونه — زمین مسکونی ۵۰۰ متری", dealType: "sale", price: "2500000000", area: "500", neighborhood: "محلهٔ نمونهٔ جدید",
    description: "زمین مسکونی با کاربری قطعی و انشعابات در دسترس. بَر ۲۰ متر رو به کوچهٔ ۱۲ متری." } },
  { slug: "land", feats: ["سند تک‌برگ", "نزدیک خیابان اصلی"], data: {
    title: "نمونه — زمین ۲۵۰ متری دو نبش", dealType: "sale", price: "1450000000", area: "250", neighborhood: "محلهٔ نمونهٔ جدید",
    description: "قطعهٔ دو نبش با دسترسی از دو کوچه؛ مناسب ساخت آپارتمان کوچک (وضعیت پروانه نیازمند استعلام)." } },
  { slug: "garden", feats: ["چاه آب", "سهم آب کشاورزی", "دیوارکشی"], data: {
    title: "نمونه — باغ پستهٔ ۸۰۰۰ متری با سهم آب", dealType: "sale", priceHidden: "on", area: "8000", neighborhood: "حومهٔ نمونهٔ دشت",
    description: "باغ پستهٔ بارده با سهم آب از چاه مشترک و دیوارکشی بخشی از محیط. قیمت پس از بازدید و بررسی مدارک اعلام می‌شود." } },
  { slug: "garden", status: "reserved", feats: ["چاه آب", "برق"], data: {
    title: "نمونه — باغ ۶۰۰۰ متری", dealType: "sale", price: "6000000000", area: "6000", neighborhood: "حومهٔ نمونهٔ دشت",
    description: "باغ با درختان جوان و برق کشاورزی. این ملک در حال حاضر رزرو شده است." } },
  { slug: "commercial", feats: ["برق", "آب", "نزدیک خیابان اصلی"], data: {
    title: "نمونه — مغازهٔ ۳۰ متری بر خیابان اصلی", dealType: "rent", deposit: "500000000", rentMonthly: "15000000", area: "30", neighborhood: "محلهٔ نمونهٔ مرکزی",
    description: "مغازه با بَر ۵ متر و ارتفاع مناسب برای نیم‌طبقه، در راستهٔ پرتردد." } },
  { slug: "commercial", status: "sold", feats: ["برق", "آب", "سند تک‌برگ"], data: {
    title: "نمونه — مغازهٔ ۴۵ متری", dealType: "sale", price: "5200000000", area: "45", neighborhood: "محلهٔ نمونهٔ مرکزی",
    description: "مغازهٔ دو دهنه با انباری پشتی. این ملک فروخته شده است." } },
  { slug: "apartment", feats: ["پارکینگ", "گاز"], data: {
    title: "نمونه — آپارتمان ۶۵ متری برای معاوضه", dealType: "exchange", price: "2700000000", area: "65", bedrooms: "1", floor: "2", totalFloors: "2", buildYear: "1393", neighborhood: "محلهٔ نمونهٔ شرقی",
    description: "مالک تمایل به معاوضه با واحد بزرگ‌تر یا زمین مسکونی دارد؛ مابه‌التفاوت توافقی." } },
  { slug: "garden", status: "draft", data: {
    title: "نمونه — باغ ۲۰۰۰ متری", dealType: "sale", priceHidden: "on", area: "2000", neighborhood: "حومهٔ نمونهٔ دشت",
    description: "پیش‌نویس: هنوز منتشر نشده و نباید در سایت دیده شود." } },
  { slug: "house", status: "pending_review", feats: ["حیاط"], data: {
    title: "نمونه — خانهٔ ۱۵۰ متری کلنگی", dealType: "sale", price: "3300000000", area: "150", landArea: "150", neighborhood: "محلهٔ نمونهٔ جنوبی",
    description: "در انتظار بررسی مدیر: خانهٔ قدیمی مناسب نوسازی." } },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed:demo در محیط production اجرا نمی‌شود.");
  const url = process.env.DATABASE_URL!;
  if (!url.startsWith("pglite:") && !process.argv.includes("--allow-postgres")) {
    throw new Error("برای جلوگیری از ورود دادهٔ ساختگی به پایگاه دادهٔ واقعی، روی PostgreSQL فقط با --allow-postgres اجرا می‌شود.");
  }
  console.log(`پایگاه داده: ${describeDb(url)}`);
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.properties);
  if (n > 0) throw new Error("پایگاه داده خالی نیست؛ دادهٔ نمونه فقط روی پایگاه دادهٔ خالی وارد می‌شود.");
  const [owner] = await db.select().from(s.users).where(eq(s.users.role, "owner")).limit(1);
  if (!owner) throw new Error("اول با npm run admin:create یک مدیر بسازید.");
  const actor: Actor = { id: owner.id, role: "owner", permissions: new Set(ALL_PERMISSIONS) };

  const cats = Object.fromEntries((await db.select().from(s.propertyCategories)).map((c) => [c.slug, c.id]));
  const featByName = Object.fromEntries((await db.select().from(s.propertyFeatures)).map((f) => [f.name, f.id]));

  const sellerA = await saveContact(db, actor, { fullName: "نمونه — مالک الف", phone: "09000000001", types: ["owner", "seller"], status: "active", source: "walk_in", notes: "مخاطب ساختگی برای آزمایش" });
  const landlord = await saveContact(db, actor, { fullName: "نمونه — موجر ب", phone: "09000000002", types: ["landlord", "owner"], status: "active", source: "phone" });
  const buyer = await saveContact(db, actor, { fullName: "نمونه — خریدار ج", phone: "09000000003", types: ["buyer"], status: "active", source: "website", budgetMin: "3000000000", budgetMax: "5000000000", preferredLocations: "محلهٔ نمونهٔ مرکزی" });
  const tenant = await saveContact(db, actor, { fullName: "نمونه — مستأجر د", phone: "09000000005", types: ["tenant"], status: "active", source: "instagram", preferredMethod: "whatsapp" });
  const shopBuyer = await saveContact(db, actor, { fullName: "نمونه — خریدار هـ", phone: "09000000006", types: ["buyer"], status: "active", source: "referral" });
  await saveContact(db, actor, { fullName: "نمونه — سرمایه‌گذار و", phone: "09000000007", types: ["prospect"], status: "active", source: "phone", requirements: "زمین یا باغ در حومه", budgetMax: "10000000000" });

  const owners: Record<string, number> = { apartment: sellerA.id, house: sellerA.id, villa: sellerA.id, land: sellerA.id, garden: sellerA.id, commercial: landlord.id };
  const created: { id: number; ref: string }[] = [];
  for (const [i, l] of LISTINGS.entries()) {
    const d = l.data;
    const p = await createProperty(db, actor, {
      city: "زرند", address: "نشانی ساختگی — خصوصی", internalNotes: "دادهٔ نمونه",
      ...d, description: `${d.description}${DISCLAIMER}`, categoryId: String(cats[l.slug]),
      ownerContactId: String(d.dealType === "rent" ? landlord.id : owners[l.slug]),
      featureIds: (l.feats ?? []).map((name) => featByName[name]).filter(Boolean),
    });
    for (const file of photosFor(i)) await addPropertyImage(db, actor, p.id, fs.readFileSync(file), ALT);
    const status = l.status ?? "published";
    if (status === "draft") { /* stays draft */ }
    else if (status === "pending_review") await changePropertyStatus(db, actor, p.id, "pending_review");
    else {
      await changePropertyStatus(db, actor, p.id, "published");
      if (status !== "published") await changePropertyStatus(db, actor, p.id, status);
    }
    if (l.featured) await db.update(s.properties).set({ featured: true }).where(eq(s.properties.id, p.id));
    created.push(p);
  }
  const byTitle = (t: string) => created[LISTINGS.findIndex((l) => l.data.title!.includes(t))];

  // Inquiries from the public site (distinct rate-limit keys so the anti-spam limiter is not tripped).
  const inq = [
    { name: "نمونه — بازدیدکننده", phone: "09000000004", message: "درخواست ساختگی برای آزمایش", ref: created[0].ref },
    { name: "نمونه — متقاضی اجاره", phone: "09000000008", message: "برای بازدید عصر پنجشنبه هماهنگ کنید.", ref: byTitle("۱۰۵ متری").ref, time: "عصرها" },
    { name: "نمونه — متقاضی باغ", phone: "09000000009", message: "مدارک و سهم آب باغ را می‌خواهم ببینم.", ref: byTitle("باغ پسته").ref },
    { name: "نمونه — متقاضی ویلا", phone: "09000000010", message: "قیمت نهایی و امکان معاوضه؟", ref: byTitle("ویلای ۴۵۰").ref, time: "صبح‌ها" },
  ];
  for (const [k, q] of inq.entries()) {
    await createPublicInquiry(db, { name: q.name, phone: q.phone, message: q.message, preferredTime: q.time, propertyRef: q.ref, consent: "on", ts: Date.now() - 10_000 }, `seed-${k}`);
  }
  await createStaffInquiry(db, actor, { name: "نمونه — تماس تلفنی", phone: "09000000011", message: "دنبال آپارتمان دو خوابه تا ۵ میلیارد", source: "phone" });

  // Follow-ups: one overdue, two upcoming.
  const hours = (h: number) => new Date(Date.now() + h * 3600_000);
  await createFollowup(db, actor, { purpose: "تماس دوباره با خریدار برای جمع‌بندی قیمت", dueAt: hours(-20), contactId: buyer.id, propertyId: created[0].id });
  await createFollowup(db, actor, { purpose: "هماهنگی بازدید آپارتمان ۱۰۵ متری", dueAt: hours(26), contactId: tenant.id, propertyId: byTitle("۱۰۵ متری").id });
  await createFollowup(db, actor, { purpose: "دریافت تصویر سند باغ پسته از مالک", dueAt: hours(70), contactId: sellerA.id, propertyId: byTitle("باغ پسته").id });

  const [commission] = await db.select().from(s.financeCategories).where(sql`${s.financeCategories.kind} = 'income' and ${s.financeCategories.isCommission}`);
  const cat = async (kind: "income" | "expense", name: string) =>
    (await db.select().from(s.financeCategories).where(sql`${s.financeCategories.kind} = ${kind} and ${s.financeCategories.name} = ${name}`))[0].id;

  // Completed sale of the sold shop, commission fully received.
  const shop = byTitle("مغازهٔ ۴۵");
  const sale = await createTransaction(db, actor, {
    kind: "sale", propertyId: String(shop.id), dealAmount: "5200000000", commissionMode: "percent", commissionRate: "0.5",
    transactionDate: daysAgo(18), partyContact: [String(landlord.id), String(shopBuyer.id)], partyRole: ["seller", "buyer"], notes: "معاملهٔ ساختگی",
  });
  await changeTransactionStatus(db, actor, sale.id, "pending");
  await createFinanceEntry(db, actor, { kind: "income", categoryId: String(commission.id), amount: "13000000", entryDate: daysAgo(17), method: "transfer", transactionId: String(sale.id), description: "دریافت ساختگی — سهم خریدار", referenceNo: "DEMO-1001" });
  await createFinanceEntry(db, actor, { kind: "income", categoryId: String(commission.id), amount: "13000000", entryDate: daysAgo(16), method: "card", transactionId: String(sale.id), description: "دریافت ساختگی — سهم فروشنده", referenceNo: "DEMO-1002" });
  await changeTransactionStatus(db, actor, sale.id, "completed", { updateProperty: false });

  // Office expenses and other income over the last four months.
  const rent = await cat("expense", "اجارهٔ دفتر"), bills = await cat("expense", "قبوض و انرژی"), ads = await cat("expense", "تبلیغات و بازاریابی"), supplies = await cat("expense", "لوازم اداری"), other = await cat("income", "سایر درآمدها");
  let ref = 2000;
  for (const m of [0, 1, 2, 3]) {
    await createFinanceEntry(db, actor, { kind: "expense", categoryId: String(rent), amount: "12000000", entryDate: daysAgo(m * 30 + 3), method: "transfer", description: "اجارهٔ ماهانهٔ دفتر (ساختگی)", referenceNo: `DEMO-${ref++}` });
    await createFinanceEntry(db, actor, { kind: "expense", categoryId: String(bills), amount: String(1800000 + m * 150000), entryDate: daysAgo(m * 30 + 8), method: "card", description: "قبض برق و گاز (ساختگی)", referenceNo: `DEMO-${ref++}` });
    if (m % 2 === 0) await createFinanceEntry(db, actor, { kind: "expense", categoryId: String(ads), amount: "4500000", entryDate: daysAgo(m * 30 + 12), method: "card", description: "تبلیغ اینستاگرام (ساختگی)", referenceNo: `DEMO-${ref++}` });
  }
  await createFinanceEntry(db, actor, { kind: "expense", categoryId: String(supplies), amount: "950000", entryDate: daysAgo(40), method: "cash", description: "کاغذ و کارتریج (ساختگی)" });
  await createFinanceEntry(db, actor, { kind: "income", categoryId: String(other), amount: "3000000", entryDate: daysAgo(55), method: "cash", description: "کارشناسی قیمت (ساختگی)" });
  await createFinanceEntry(db, actor, { kind: "income", categoryId: String(other), amount: "6000000", entryDate: daysAgo(70), method: "transfer", description: "مشاورهٔ ملکی (ساختگی)" });

  // Rental in progress, commission partially received — created last so it heads the transactions list.
  const tx = await createTransaction(db, actor, {
    kind: "rent", propertyId: String(byTitle("۷۰ متری برای اجاره").id), dealAmount: "300000000", monthlyRent: "8000000",
    commissionMode: "fixed", commissionFixed: "4000000", transactionDate: daysAgo(0),
    partyContact: [String(landlord.id), String(tenant.id)], partyRole: ["landlord", "tenant"], notes: "معاملهٔ ساختگی",
  });
  await createFinanceEntry(db, actor, { kind: "income", categoryId: String(commission.id), amount: "2500000", entryDate: daysAgo(0), method: "card", transactionId: String(tx.id), description: "دریافت ساختگی — بخشی از کمیسیون" });
  await changeTransactionStatus(db, actor, tx.id, "pending");

  const pub = LISTINGS.filter((l) => !l.status || l.status === "published" || l.status === "reserved").length;
  console.log(`دادهٔ نمونه وارد شد: ${faDigits(created.length)} آگهی (${faDigits(pub)} در جست‌وجوی سایت)، ۶ مخاطب، ۵ درخواست، ۳ پیگیری، ۲ معامله، ثبت‌های مالی چهار ماه.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("خطا:", e instanceof Error ? e.message : e); process.exit(1); });
