import "server-only";
import { INQUIRY_STATUSES, INQUIRY_SOURCES, CONTACT_TYPES, CONTACT_METHODS, CONTACT_STATUSES } from "@/lib/vocab";
export { INQUIRY_STATUSES, INQUIRY_SOURCES, CONTACT_TYPES, CONTACT_METHODS, CONTACT_STATUSES };
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { DB, DBorTx } from "../db";
import * as s from "../db/schema";
import {
  assertCan, likePattern, normalizeSearch, PAGE_SIZE, parseOrThrow, ServiceError, type Actor,
  zEnum, zId, zMoney, zOptPhone, zOptText, zPhone, zText,
} from "./common";
import { audit, rateLimit } from "./infra";
import { PUBLIC_PAGE_STATUSES } from "./properties";
import { enDigits } from "@/lib/format";

/* ───── Vocabulary ───── */

export type InquiryStatus = keyof typeof INQUIRY_STATUSES;
export const OPEN_INQUIRY_STATUSES: InquiryStatus[] = ["new", "contacted", "follow_up", "visit_scheduled", "negotiation"];



/* ───── Public inquiry ───── */

export const publicInquiryInput = z.object({
  name: zText(80),
  phone: zPhone,
  message: zOptText(1500),
  preferredTime: zOptText(80),
  propertyRef: zOptText(30),
  consent: z.literal("on", { errorMap: () => ({ message: "برای ارسال، موافقت با استفاده از اطلاعات تماس لازم است." }) }),
  // honeypot — real visitors never fill it
  website: z.string().max(0).optional().or(z.literal("")),
  // timestamp the form was rendered; submissions faster than 2s are treated as bots
  ts: z.coerce.number().int().optional(),
});

export async function createPublicInquiry(db: DB, raw: Record<string, unknown>, ipKey: string) {
  const data = parseOrThrow(publicInquiryInput, raw);
  if (data.ts && Date.now() - data.ts < 2000) throw new ServiceError("ارسال خیلی سریع بود؛ لطفاً دوباره تلاش کنید.");
  const allowed = await rateLimit(db, `inquiry:${ipKey}`, 5, 3600);
  if (!allowed) throw new ServiceError("تعداد درخواست‌های شما زیاد است. لطفاً کمی بعد دوباره تلاش کنید یا تماس بگیرید.");
  const phoneAllowed = await rateLimit(db, `inquiry-phone:${data.phone}`, 5, 24 * 3600);
  if (!phoneAllowed) throw new ServiceError("برای این شماره چند درخواست ثبت شده است؛ همکاران ما تماس می‌گیرند.");
  return db.transaction(async (tx) => {
    let propertyId: number | null = null;
    if (data.propertyRef) {
      const [p] = await tx.select({ id: s.properties.id }).from(s.properties)
        .where(and(eq(s.properties.ref, data.propertyRef.toUpperCase()), inArray(s.properties.status, PUBLIC_PAGE_STATUSES)));
      propertyId = p?.id ?? null;
    }
    // Link to an existing contact only on an exact normalised phone match (never by name).
    const [contact] = await tx.select({ id: s.contacts.id, agentId: s.contacts.agentId }).from(s.contacts)
      .where(and(eq(s.contacts.phone, data.phone), sql`${s.contacts.status} <> 'archived'`)).limit(1);
    let agentId: number | null = contact?.agentId ?? null;
    if (!agentId && propertyId) {
      const [p] = await tx.select({ agentId: s.properties.agentId }).from(s.properties).where(eq(s.properties.id, propertyId));
      agentId = p?.agentId ?? null;
    }
    const [row] = await tx.insert(s.inquiries).values({
      name: data.name, phone: data.phone, message: data.message, preferredTime: data.preferredTime,
      propertyId, contactId: contact?.id ?? null, agentId,
      source: propertyId ? "website_property" : "website_contact", status: "new",
    }).returning({ id: s.inquiries.id });
    await tx.insert(s.inquiryActivities).values({ inquiryId: row.id, kind: "status", body: "درخواست از وب‌سایت ثبت شد" + (contact ? " و به مخاطب موجود متصل شد" : "") });
    return row;
  });
}

/* ───── Staff inquiry management ───── */

export const inquiryFilters = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(Object.keys(INQUIRY_STATUSES) as [InquiryStatus, ...InquiryStatus[]]).optional().catch(undefined),
  open: z.enum(["1"]).optional().catch(undefined),
  agent: z.coerce.number().int().positive().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

export function inquiryScope(actor: Actor): SQL | undefined {
  // Without the "view all" listing permission, staff see inquiries assigned to them or still unassigned.
  if (actor.permissions.has("properties.viewAll") || actor.role === "owner") return undefined;
  return or(eq(s.inquiries.agentId, actor.id), sql`${s.inquiries.agentId} is null`);
}

export async function listInquiries(db: DBorTx, actor: Actor, raw: Record<string, unknown>) {
  assertCan(actor, "inquiries.view");
  const f = inquiryFilters.parse(raw);
  const conds: (SQL | undefined)[] = [inquiryScope(actor)];
  const q = normalizeSearch(f.q);
  if (q) conds.push(or(ilike(s.inquiries.name, likePattern(q)), ilike(s.inquiries.phone, likePattern(q)), ilike(s.inquiries.message, likePattern(q))));
  if (f.status) conds.push(eq(s.inquiries.status, f.status));
  if (f.open) conds.push(inArray(s.inquiries.status, OPEN_INQUIRY_STATUSES));
  if (f.agent) conds.push(eq(s.inquiries.agentId, f.agent));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.inquiries).where(where);
  const rows = await db.select({ i: s.inquiries, propertyRef: s.properties.ref, propertyTitle: s.properties.title, agentName: s.users.name })
    .from(s.inquiries)
    .leftJoin(s.properties, eq(s.properties.id, s.inquiries.propertyId))
    .leftJoin(s.users, eq(s.users.id, s.inquiries.agentId))
    .where(where).orderBy(desc(s.inquiries.createdAt)).limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE);
  return { rows, total, page: f.page, filters: f };
}

export async function getInquiry(db: DBorTx, actor: Actor, id: number) {
  assertCan(actor, "inquiries.view");
  const [row] = await db.select({ i: s.inquiries, propertyRef: s.properties.ref, propertyTitle: s.properties.title, propertyId: s.properties.id })
    .from(s.inquiries).leftJoin(s.properties, eq(s.properties.id, s.inquiries.propertyId))
    .where(and(eq(s.inquiries.id, id), inquiryScope(actor)));
  if (!row) throw new ServiceError("درخواست پیدا نشد یا به آن دسترسی ندارید.");
  const activities = await db.select({ a: s.inquiryActivities, by: s.users.name }).from(s.inquiryActivities)
    .leftJoin(s.users, eq(s.users.id, s.inquiryActivities.createdBy))
    .where(eq(s.inquiryActivities.inquiryId, id)).orderBy(desc(s.inquiryActivities.createdAt));
  const matches = row.i.contactId ? [] : await db.select({ id: s.contacts.id, fullName: s.contacts.fullName, phone: s.contacts.phone })
    .from(s.contacts).where(or(eq(s.contacts.phone, row.i.phone), eq(s.contacts.phone2, row.i.phone))).limit(5);
  const contact = row.i.contactId ? (await db.select().from(s.contacts).where(eq(s.contacts.id, row.i.contactId)))[0] ?? null : null;
  const fups = await db.select().from(s.followups).where(eq(s.followups.inquiryId, id)).orderBy(asc(s.followups.dueAt));
  return { ...row, activities, matches, contact, followups: fups };
}

async function touchInquiry(tx: DBorTx, actor: Actor, id: number, kind: string, body: string) {
  await tx.insert(s.inquiryActivities).values({ inquiryId: id, kind, body, createdBy: actor.id });
  await tx.update(s.inquiries).set({ updatedAt: new Date() }).where(eq(s.inquiries.id, id));
}

export async function setInquiryStatus(db: DB, actor: Actor, id: number, status: string, note?: string | null) {
  assertCan(actor, "inquiries.manage");
  if (!(status in INQUIRY_STATUSES)) throw new ServiceError("وضعیت معتبر نیست.");
  await getInquiry(db, actor, id);
  await db.transaction(async (tx) => {
    await tx.update(s.inquiries).set({ status }).where(eq(s.inquiries.id, id));
    await touchInquiry(tx, actor, id, "status", `وضعیت: ${INQUIRY_STATUSES[status as InquiryStatus]}${note ? ` — ${note}` : ""}`);
  });
}

export async function assignInquiry(db: DB, actor: Actor, id: number, agentId: number | null) {
  assertCan(actor, "inquiries.manage");
  await getInquiry(db, actor, id);
  let name = "بدون مسئول";
  if (agentId) {
    const [u] = await db.select().from(s.users).where(and(eq(s.users.id, agentId), eq(s.users.isActive, true)));
    if (!u) throw new ServiceError("کاربر پیدا نشد.");
    name = u.name;
  }
  await db.transaction(async (tx) => {
    await tx.update(s.inquiries).set({ agentId }).where(eq(s.inquiries.id, id));
    await touchInquiry(tx, actor, id, "assign", `واگذار شد به: ${name}`);
  });
}

export async function addInquiryNote(db: DB, actor: Actor, id: number, kind: "note" | "call", body: string) {
  assertCan(actor, "inquiries.manage");
  const text = body.trim();
  if (!text) throw new ServiceError("متن یادداشت خالی است.", { body: "متن را بنویسید." });
  if (text.length > 2000) throw new ServiceError("یادداشت بیش از حد طولانی است.");
  await getInquiry(db, actor, id);
  await db.transaction(async (tx) => touchInquiry(tx, actor, id, kind, (kind === "call" ? "تماس: " : "") + text));
}

export async function linkInquiryContact(db: DB, actor: Actor, id: number, contactId: number) {
  assertCan(actor, "inquiries.manage", "contacts.view");
  const inq = await getInquiry(db, actor, id);
  const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, contactId));
  if (!c) throw new ServiceError("مخاطب پیدا نشد.");
  await db.transaction(async (tx) => {
    await tx.update(s.inquiries).set({ contactId }).where(eq(s.inquiries.id, inq.i.id));
    await touchInquiry(tx, actor, id, "link", `به مخاطب «${c.fullName}» متصل شد`);
  });
}

export async function createContactFromInquiry(db: DB, actor: Actor, id: number) {
  assertCan(actor, "inquiries.manage", "contacts.manage");
  const inq = await getInquiry(db, actor, id);
  if (inq.i.contactId) throw new ServiceError("این درخواست قبلاً به مخاطب متصل شده است.");
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(s.contacts).values({
      fullName: inq.i.name, phone: inq.i.phone, types: ["prospect"], source: "website",
      requirements: inq.i.message, agentId: inq.i.agentId, createdBy: actor.id,
    }).returning();
    await tx.update(s.inquiries).set({ contactId: c.id }).where(eq(s.inquiries.id, id));
    await touchInquiry(tx, actor, id, "link", `مخاطب جدید «${c.fullName}» ساخته و متصل شد`);
    await audit(tx, actor.id, "contact.create", "contact", c.id, { fromInquiry: id });
    return c;
  });
}

export async function linkInquiryTransaction(db: DB, actor: Actor, id: number, transactionId: number) {
  assertCan(actor, "inquiries.manage", "transactions.view");
  await getInquiry(db, actor, id);
  const [t] = await db.select().from(s.transactions).where(eq(s.transactions.id, transactionId));
  if (!t) throw new ServiceError("معامله پیدا نشد.");
  await db.transaction(async (tx) => {
    await tx.update(s.inquiries).set({ transactionId, status: "converted" }).where(eq(s.inquiries.id, id));
    await touchInquiry(tx, actor, id, "link", `به معاملهٔ ${t.code} متصل شد؛ وضعیت: به معامله رسید`);
  });
}

/** Staff-entered inquiry (phone call, walk-in). */
export const staffInquiryInput = z.object({
  name: zText(80), phone: zPhone, message: zOptText(1500),
  source: zEnum(["phone", "walk_in", "instagram", "whatsapp", "referral", "other"]),
  propertyId: zId,
});
export async function createStaffInquiry(db: DB, actor: Actor, raw: unknown) {
  assertCan(actor, "inquiries.manage");
  const d = parseOrThrow(staffInquiryInput, raw);
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ id: s.contacts.id }).from(s.contacts).where(eq(s.contacts.phone, d.phone)).limit(1);
    const [row] = await tx.insert(s.inquiries).values({ ...d, contactId: c?.id ?? null, agentId: actor.id, status: "new" }).returning();
    await touchInquiry(tx, actor, row.id, "status", "درخواست توسط کارکنان ثبت شد");
    return row;
  });
}

/* ───── Contacts ───── */

export const contactInput = z.object({
  fullName: zText(120),
  phone: zPhone,
  phone2: zOptPhone,
  email: zOptText(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "ایمیل معتبر نیست."),
  types: z.array(zEnum(Object.keys(CONTACT_TYPES) as [string, ...string[]])).min(1, "دست‌کم یک نوع مخاطب انتخاب کنید.").max(7),
  preferredMethod: z.preprocess((v) => (v === "" ? null : v), z.enum(["phone", "whatsapp", "sms", "in_person"]).nullable().optional()).transform((v) => v ?? null),
  requirements: zOptText(3000),
  budgetMin: zMoney,
  budgetMax: zMoney,
  preferredLocations: zOptText(300),
  preferredCategoryIds: z.array(z.coerce.number().int().positive()).max(20).default([]),
  agentId: zId,
  source: z.preprocess((v) => (v === "" ? null : v), z.enum(["website", "phone", "walk_in", "referral", "instagram", "whatsapp", "other"]).nullable().optional()).transform((v) => v ?? null),
  status: zEnum(["active", "inactive", "archived"]),
  notes: zOptText(5000),
  force: z.preprocess((v) => v === "1" || v === "on", z.boolean()).optional(),
});

export async function findContactsByPhone(db: DBorTx, phone: string, excludeId?: number) {
  return db.select({ id: s.contacts.id, fullName: s.contacts.fullName }).from(s.contacts)
    .where(and(or(eq(s.contacts.phone, phone), eq(s.contacts.phone2, phone)), excludeId ? sql`${s.contacts.id} <> ${excludeId}` : undefined));
}

export async function saveContact(db: DB, actor: Actor, raw: unknown, id?: number) {
  assertCan(actor, "contacts.manage");
  const d = parseOrThrow(contactInput, raw);
  if (d.budgetMin !== null && d.budgetMax !== null && d.budgetMin > d.budgetMax) {
    throw new ServiceError("حداقل بودجه از حداکثر بیشتر است.", { budgetMax: "حداکثر باید بیشتر از حداقل باشد." });
  }
  const dupes = await findContactsByPhone(db, d.phone, id);
  if (dupes.length && !d.force) {
    throw new ServiceError(`مخاطبی با همین شماره وجود دارد: ${dupes.map((x) => x.fullName).join("، ")}. اگر شخص دیگری است، «ثبت با وجود شمارهٔ تکراری» را بزنید.`, { phone: "شمارهٔ تکراری" });
  }
  const { force: _force, ...values } = d;
  void _force;
  if (id) {
    const [row] = await db.update(s.contacts).set({ ...values, updatedAt: new Date() }).where(eq(s.contacts.id, id)).returning();
    if (!row) throw new ServiceError("مخاطب پیدا نشد.");
    await audit(db, actor.id, "contact.update", "contact", id);
    return row;
  }
  const [row] = await db.insert(s.contacts).values({ ...values, createdBy: actor.id }).returning();
  await audit(db, actor.id, "contact.create", "contact", row.id);
  return row;
}

export const contactFilters = z.object({
  q: z.string().optional().catch(undefined),
  type: z.string().regex(/^[a-z_]+$/).optional().catch(undefined),
  status: z.enum(["active", "inactive", "archived"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

export async function listContacts(db: DBorTx, actor: Actor, raw: Record<string, unknown>) {
  assertCan(actor, "contacts.view");
  const f = contactFilters.parse(raw);
  const conds: (SQL | undefined)[] = [];
  const q = normalizeSearch(f.q);
  if (q) {
    const digits = enDigits(q).replace(/\D/g, "");
    conds.push(or(ilike(s.contacts.fullName, likePattern(q)), digits.length >= 4 ? ilike(s.contacts.phone, likePattern(digits)) : undefined, ilike(s.contacts.notes, likePattern(q))));
  }
  if (f.type) conds.push(sql`${f.type} = any(${s.contacts.types})`);
  conds.push(f.status ? eq(s.contacts.status, f.status) : sql`${s.contacts.status} <> 'archived'`);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.contacts).where(where);
  const rows = await db.select({ c: s.contacts, agentName: s.users.name }).from(s.contacts)
    .leftJoin(s.users, eq(s.users.id, s.contacts.agentId))
    .where(where).orderBy(desc(s.contacts.updatedAt)).limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE);
  return { rows, total, page: f.page, filters: f };
}

export async function getContact(db: DBorTx, actor: Actor, id: number) {
  assertCan(actor, "contacts.view");
  const [c] = await db.select().from(s.contacts).where(eq(s.contacts.id, id));
  if (!c) throw new ServiceError("مخاطب پیدا نشد.");
  const inqs = await db.select({ i: s.inquiries, propertyRef: s.properties.ref }).from(s.inquiries)
    .leftJoin(s.properties, eq(s.properties.id, s.inquiries.propertyId))
    .where(eq(s.inquiries.contactId, id)).orderBy(desc(s.inquiries.createdAt)).limit(50);
  const owned = await db.select({ id: s.properties.id, ref: s.properties.ref, title: s.properties.title, status: s.properties.status })
    .from(s.properties).where(eq(s.properties.ownerContactId, id)).limit(50);
  const txs = actor.permissions.has("transactions.view")
    ? await db.select({ t: s.transactions, role: s.transactionParties.role }).from(s.transactionParties)
      .innerJoin(s.transactions, eq(s.transactions.id, s.transactionParties.transactionId))
      .where(eq(s.transactionParties.contactId, id)).orderBy(desc(s.transactions.createdAt))
    : [];
  const fups = await db.select().from(s.followups).where(eq(s.followups.contactId, id)).orderBy(desc(s.followups.dueAt)).limit(50);
  return { contact: c, inquiries: inqs, owned, transactions: txs, followups: fups };
}

export async function searchContactsBrief(db: DBorTx, actor: Actor, q: string) {
  assertCan(actor, "contacts.view");
  const n = normalizeSearch(q);
  if (n.length < 2) return [];
  const digits = n.replace(/\D/g, "");
  return db.select({ id: s.contacts.id, fullName: s.contacts.fullName, phone: s.contacts.phone }).from(s.contacts)
    .where(and(or(ilike(s.contacts.fullName, likePattern(n)), digits.length >= 4 ? ilike(s.contacts.phone, likePattern(digits)) : undefined), sql`${s.contacts.status} <> 'archived'`))
    .orderBy(asc(s.contacts.fullName)).limit(20);
}

/* ───── Follow-ups ───── */

export const followupInput = z.object({
  purpose: zText(200),
  dueAt: z.date({ invalid_type_error: "تاریخ و ساعت معتبر نیست." }),
  assignedTo: zId,
  contactId: zId,
  propertyId: zId,
  inquiryId: zId,
  notes: zOptText(2000),
});

export async function createFollowup(db: DB, actor: Actor, raw: unknown) {
  assertCan(actor, "followups.manage");
  const d = parseOrThrow(followupInput, raw);
  const assignedTo = d.assignedTo ?? actor.id;
  const [row] = await db.insert(s.followups).values({ ...d, assignedTo, createdBy: actor.id }).returning();
  if (d.inquiryId) {
    await db.insert(s.inquiryActivities).values({ inquiryId: d.inquiryId, kind: "note", body: `پیگیری تعیین شد: ${d.purpose}`, createdBy: actor.id });
  }
  await audit(db, actor.id, "followup.create", "followup", row.id);
  return row;
}

export async function completeFollowup(db: DB, actor: Actor, id: number, done: boolean) {
  assertCan(actor, "followups.manage");
  const [row] = await db.update(s.followups).set({ done, doneAt: done ? new Date() : null }).where(eq(s.followups.id, id)).returning();
  if (!row) throw new ServiceError("پیگیری پیدا نشد.");
  if (row.inquiryId && done) {
    await db.insert(s.inquiryActivities).values({ inquiryId: row.inquiryId, kind: "note", body: `پیگیری انجام شد: ${row.purpose}`, createdBy: actor.id });
  }
}

export async function listFollowups(db: DBorTx, actor: Actor, view: "open" | "overdue" | "done" | "mine") {
  assertCan(actor, "followups.manage");
  const now = new Date();
  const cond = {
    open: eq(s.followups.done, false),
    overdue: and(eq(s.followups.done, false), lt(s.followups.dueAt, now)),
    done: eq(s.followups.done, true),
    mine: and(eq(s.followups.done, false), eq(s.followups.assignedTo, actor.id)),
  }[view];
  return db.select({ f: s.followups, contactName: s.contacts.fullName, propertyRef: s.properties.ref, assignee: s.users.name })
    .from(s.followups)
    .leftJoin(s.contacts, eq(s.contacts.id, s.followups.contactId))
    .leftJoin(s.properties, eq(s.properties.id, s.followups.propertyId))
    .leftJoin(s.users, eq(s.users.id, s.followups.assignedTo))
    .where(cond).orderBy(view === "done" ? desc(s.followups.doneAt) : asc(s.followups.dueAt)).limit(200);
}

export async function upcomingFollowups(db: DBorTx, actor: Actor, days = 7) {
  const until = new Date(Date.now() + days * 86400_000);
  return db.select({ f: s.followups, contactName: s.contacts.fullName })
    .from(s.followups).leftJoin(s.contacts, eq(s.contacts.id, s.followups.contactId))
    .where(and(eq(s.followups.done, false), lt(s.followups.dueAt, until),
      actor.role === "owner" ? undefined : eq(s.followups.assignedTo, actor.id)))
    .orderBy(asc(s.followups.dueAt)).limit(8);
}

