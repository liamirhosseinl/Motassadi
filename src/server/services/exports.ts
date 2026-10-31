import "server-only";
import { desc, eq, ne } from "drizzle-orm";
import type { DBorTx } from "@/server/db";
import * as s from "@/server/db/schema";
import { assertCan, ServiceError, type Actor } from "./common";
import { scopeCondition } from "./properties";
import { inquiryScope } from "./crm";
import { listFinance } from "./deals";
import { toCsv } from "@/lib/csv";
import { formatDate, formatDateTime } from "@/lib/format";
import { CONTACT_STATUSES, CONTACT_TYPES, DEAL_TYPES, INQUIRY_SOURCES, INQUIRY_STATUSES, PAYMENT_METHODS, PROPERTY_STATUSES, TX_KINDS, TX_STATUSES } from "@/lib/vocab";

export const DATASETS = ["properties", "contacts", "inquiries", "transactions", "finance"] as const;
export type Dataset = (typeof DATASETS)[number];
const MAX_ROWS = 20000;

const label = <T extends Record<string, string>>(m: T, v: unknown) => (m as Record<string, string>)[String(v)] ?? String(v ?? "");
/** CSV amounts are plain integers in toman (no grouping) so spreadsheets can sum them. */
const amount = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Builds a CSV export. Every dataset re-checks the permission and applies the same row scope as its list page. */
export async function exportDataset(db: DBorTx, actor: Actor, dataset: string, params: Record<string, unknown>): Promise<{ filename: string; csv: string; rows: number }> {
  assertCan(actor, "export.data");
  const stamp = new Date().toISOString().slice(0, 10);
  switch (dataset as Dataset) {
    case "properties": {
      assertCan(actor, "properties.view");
      const rows = await db.select({
        ref: s.properties.ref, title: s.properties.title, deal: s.properties.dealType, status: s.properties.status, category: s.propertyCategories.name,
        price: s.properties.price, deposit: s.properties.deposit, rent: s.properties.rentMonthly, area: s.properties.area, bedrooms: s.properties.bedrooms,
        city: s.properties.city, neighborhood: s.properties.neighborhood, agent: s.users.name, updatedAt: s.properties.updatedAt,
      }).from(s.properties).innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
        .leftJoin(s.users, eq(s.users.id, s.properties.agentId))
        .where(scopeCondition(actor)).orderBy(desc(s.properties.updatedAt)).limit(MAX_ROWS);
      return { filename: `properties-${stamp}.csv`, rows: rows.length, csv: toCsv(rows, [
        { key: "ref", label: "کد" }, { key: "title", label: "عنوان" }, { key: "deal", label: "نوع معامله", format: (v) => label(DEAL_TYPES, v) },
        { key: "status", label: "وضعیت", format: (v) => label(PROPERTY_STATUSES, v) }, { key: "category", label: "نوع ملک" },
        { key: "price", label: "قیمت (تومان)", format: amount }, { key: "deposit", label: "ودیعه (تومان)", format: amount }, { key: "rent", label: "اجاره ماهانه (تومان)", format: amount },
        { key: "area", label: "متراژ" }, { key: "bedrooms", label: "خواب" }, { key: "city", label: "شهر" }, { key: "neighborhood", label: "محله" },
        { key: "agent", label: "مشاور" }, { key: "updatedAt", label: "به‌روزرسانی", format: (v) => formatDate(v as Date) },
      ]) };
    }
    case "contacts": {
      assertCan(actor, "contacts.view");
      const rows = await db.select({
        fullName: s.contacts.fullName, phone: s.contacts.phone, phone2: s.contacts.phone2, email: s.contacts.email, types: s.contacts.types,
        status: s.contacts.status, budgetMin: s.contacts.budgetMin, budgetMax: s.contacts.budgetMax, preferredLocations: s.contacts.preferredLocations,
        agent: s.users.name, createdAt: s.contacts.createdAt,
      }).from(s.contacts).leftJoin(s.users, eq(s.users.id, s.contacts.agentId)).where(ne(s.contacts.status, "archived"))
        .orderBy(desc(s.contacts.updatedAt)).limit(MAX_ROWS);
      return { filename: `contacts-${stamp}.csv`, rows: rows.length, csv: toCsv(rows, [
        { key: "fullName", label: "نام" }, { key: "phone", label: "تلفن" }, { key: "phone2", label: "تلفن دوم" }, { key: "email", label: "ایمیل" },
        { key: "types", label: "نوع", format: (v) => (v as string[]).map((t) => label(CONTACT_TYPES, t)).join("، ") },
        { key: "status", label: "وضعیت", format: (v) => label(CONTACT_STATUSES, v) },
        { key: "budgetMin", label: "حداقل بودجه (تومان)", format: amount }, { key: "budgetMax", label: "حداکثر بودجه (تومان)", format: amount },
        { key: "preferredLocations", label: "محله‌ها" }, { key: "agent", label: "مسئول" }, { key: "createdAt", label: "ثبت", format: (v) => formatDate(v as Date) },
      ]) };
    }
    case "inquiries": {
      assertCan(actor, "inquiries.view");
      const rows = await db.select({
        name: s.inquiries.name, phone: s.inquiries.phone, source: s.inquiries.source, status: s.inquiries.status, propertyRef: s.properties.ref,
        message: s.inquiries.message, agent: s.users.name, createdAt: s.inquiries.createdAt,
      }).from(s.inquiries).leftJoin(s.properties, eq(s.properties.id, s.inquiries.propertyId)).leftJoin(s.users, eq(s.users.id, s.inquiries.agentId))
        .where(inquiryScope(actor)).orderBy(desc(s.inquiries.createdAt)).limit(MAX_ROWS);
      return { filename: `inquiries-${stamp}.csv`, rows: rows.length, csv: toCsv(rows, [
        { key: "createdAt", label: "زمان", format: (v) => formatDateTime(v as Date) }, { key: "name", label: "نام" }, { key: "phone", label: "تلفن" },
        { key: "source", label: "منبع", format: (v) => label(INQUIRY_SOURCES, v) }, { key: "status", label: "وضعیت", format: (v) => label(INQUIRY_STATUSES, v) },
        { key: "propertyRef", label: "کد ملک" }, { key: "agent", label: "مسئول" }, { key: "message", label: "پیام" },
      ]) };
    }
    case "transactions": {
      assertCan(actor, "transactions.view");
      const rows = await db.select({
        code: s.transactions.code, kind: s.transactions.kind, status: s.transactions.status, propertyRef: s.properties.ref, transactionDate: s.transactions.transactionDate,
        dealAmount: s.transactions.dealAmount, monthlyRent: s.transactions.monthlyRent, expectedCommission: s.transactions.expectedCommission, agent: s.users.name,
      }).from(s.transactions).leftJoin(s.properties, eq(s.properties.id, s.transactions.propertyId)).leftJoin(s.users, eq(s.users.id, s.transactions.agentId))
        .orderBy(desc(s.transactions.createdAt)).limit(MAX_ROWS);
      return { filename: `transactions-${stamp}.csv`, rows: rows.length, csv: toCsv(rows, [
        { key: "code", label: "کد" }, { key: "kind", label: "نوع", format: (v) => label(TX_KINDS, v) }, { key: "status", label: "وضعیت", format: (v) => label(TX_STATUSES, v) },
        { key: "propertyRef", label: "کد ملک" }, { key: "transactionDate", label: "تاریخ", format: (v) => (v ? formatDate(String(v)) : "") },
        { key: "dealAmount", label: "ارزش معامله (تومان) — درآمد نیست", format: amount }, { key: "monthlyRent", label: "اجاره ماهانه (تومان)", format: amount },
        { key: "expectedCommission", label: "کمیسیون مورد انتظار (تومان)", format: amount }, { key: "agent", label: "مشاور" },
      ]) };
    }
    case "finance": {
      const res = await listFinance(db, actor, params, { all: true });
      const rows = res.rows.map(({ e, categoryName, txCode, by }) => ({
        entryDate: e.entryDate, kind: e.kind, category: categoryName, amount: e.amount, method: e.method, referenceNo: e.referenceNo,
        txCode, description: e.description, status: e.status, voidReason: e.voidReason, by,
      }));
      return { filename: `finance-${stamp}.csv`, rows: rows.length, csv: toCsv(rows, [
        { key: "entryDate", label: "تاریخ", format: (v) => formatDate(String(v)) }, { key: "kind", label: "نوع", format: (v) => (v === "income" ? "دریافت" : "پرداخت") },
        { key: "category", label: "دسته" }, { key: "amount", label: "مبلغ (تومان)", format: amount }, { key: "method", label: "روش", format: (v) => (v ? label(PAYMENT_METHODS, v) : "") },
        { key: "referenceNo", label: "شماره پیگیری" }, { key: "txCode", label: "معامله" }, { key: "description", label: "شرح" },
        { key: "status", label: "وضعیت", format: (v) => (v === "void" ? "باطل" : "ثبت‌شده") }, { key: "voidReason", label: "دلیل ابطال" }, { key: "by", label: "ثبت‌کننده" },
      ]) };
    }
    default:
      throw new ServiceError("نوع خروجی نامعتبر است.");
  }
}
