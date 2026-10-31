import "server-only";
import { TX_KINDS, TX_STATUSES, PARTY_ROLES, PAYMENT_STATES, PAYMENT_METHODS } from "@/lib/vocab";
export { TX_KINDS, TX_STATUSES, PARTY_ROLES, PAYMENT_STATES, PAYMENT_METHODS };
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { DB, DBorTx } from "../db";
import * as s from "../db/schema";
import {
  assertCan, likePattern, normalizeSearch, PAGE_SIZE, parseOrThrow, ServiceError, type Actor,
  zEnum, zId, zJalaliDate, zJalaliDateRequired, zMoney, zMoneyRequired, zOptText,
} from "./common";
import { audit, nextReference } from "./infra";
import { readSettings } from "./settings";
import { changePropertyStatus } from "./properties";
import { enDigits, todayIso } from "@/lib/format";

/* ════════════════ Transactions ════════════════ */

export type TxStatus = keyof typeof TX_STATUSES;

/** "2.5" / "۲٫۵" → 250 basis points. */
function parsePercentToBp(v: unknown): number | null | typeof Number.NaN {
  if (v === null || v === undefined) return null;
  const str = enDigits(String(v)).replace("٫", ".").replace("%", "").trim();
  if (str === "") return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(str)) return Number.NaN;
  return Math.round(Number(str) * 100);
}

export const transactionInput = z.object({
  kind: zEnum(["sale", "rent", "other"]),
  propertyId: zId,
  agentId: zId,
  dealAmount: zMoney,
  monthlyRent: zMoney,
  commissionMode: zEnum(["fixed", "percent"]),
  commissionRate: z.preprocess(parsePercentToBp, z.number({ invalid_type_error: "درصد را مثل ۲٫۵ وارد کنید." }).int().min(0).max(5000, "درصد بیش از حد است.").nullable()),
  commissionFixed: zMoney,
  transactionDate: zJalaliDate,
  notes: zOptText(5000),
  partyContact: z.array(z.coerce.number().int().positive()).max(10).default([]),
  partyRole: z.array(zEnum(["buyer", "seller", "tenant", "landlord", "other"])).max(10).default([]),
});

/** Expected brokerage commission — computed only on the server from explicit inputs. */
export function computeExpectedCommission(mode: "fixed" | "percent", rateBp: number | null, fixed: number | null, dealAmount: number | null): number {
  if (mode === "percent") {
    if (rateBp === null || dealAmount === null) return 0;
    return Math.round((dealAmount * rateBp) / 10000);
  }
  return fixed ?? 0;
}

async function validateTx(db: DBorTx, raw: unknown) {
  const d = parseOrThrow(transactionInput, raw);
  if (d.commissionMode === "percent") {
    if (d.commissionRate === null) throw new ServiceError("درصد کمیسیون را وارد کنید.", { commissionRate: "درصد را وارد کنید." });
    if (d.dealAmount === null) throw new ServiceError("برای کمیسیون درصدی، ارزش معامله لازم است.", { dealAmount: "ارزش معامله را وارد کنید." });
  }
  if (d.partyContact.length !== d.partyRole.length) throw new ServiceError("اطلاعات طرفین معامله ناقص است.");
  if (d.partyContact.length) {
    const found = await db.select({ id: s.contacts.id }).from(s.contacts).where(inArray(s.contacts.id, d.partyContact));
    if (found.length !== new Set(d.partyContact).size) throw new ServiceError("یکی از طرفین معامله پیدا نشد.");
  }
  if (d.propertyId) {
    const [p] = await db.select({ id: s.properties.id }).from(s.properties).where(eq(s.properties.id, d.propertyId));
    if (!p) throw new ServiceError("ملک پیدا نشد.", { propertyId: "ملک پیدا نشد." });
  }
  const expected = computeExpectedCommission(d.commissionMode, d.commissionRate, d.commissionFixed, d.dealAmount);
  return { d, expected };
}

async function writeParties(tx: DBorTx, transactionId: number, contactsIds: number[], roles: string[]) {
  await tx.delete(s.transactionParties).where(eq(s.transactionParties.transactionId, transactionId));
  const seen = new Set<string>();
  const rows = contactsIds.map((contactId, i) => ({ transactionId, contactId, role: roles[i] }))
    .filter((r) => { const k = `${r.contactId}:${r.role}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (rows.length) await tx.insert(s.transactionParties).values(rows);
}

export async function createTransaction(db: DB, actor: Actor, raw: unknown) {
  assertCan(actor, "transactions.manage");
  return db.transaction(async (tx) => {
    const { d, expected } = await validateTx(tx, raw);
    const settings = await readSettings(tx);
    const code = await nextReference(tx, settings.refs.transactionPrefix, "transaction");
    const [row] = await tx.insert(s.transactions).values({
      code, kind: d.kind, propertyId: d.propertyId, agentId: d.agentId ?? actor.id, status: "draft",
      dealAmount: d.dealAmount, monthlyRent: d.monthlyRent, commissionMode: d.commissionMode,
      commissionRateBp: d.commissionMode === "percent" ? d.commissionRate : null,
      commissionFixed: d.commissionMode === "fixed" ? d.commissionFixed : null,
      expectedCommission: expected, transactionDate: d.transactionDate, notes: d.notes, createdBy: actor.id,
    }).returning();
    await writeParties(tx, row.id, d.partyContact, d.partyRole);
    await audit(tx, actor.id, "transaction.create", "transaction", row.id, { code, expected });
    return row;
  });
}

export async function updateTransaction(db: DB, actor: Actor, id: number, raw: unknown, expectedVersion?: number) {
  assertCan(actor, "transactions.manage");
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(s.transactions).where(eq(s.transactions.id, id));
    if (!cur) throw new ServiceError("معامله پیدا نشد.");
    if (cur.status === "completed" || cur.status === "cancelled") {
      throw new ServiceError("معاملهٔ تکمیل‌شده یا لغوشده قابل ویرایش نیست. برای اصلاح، مدیر باید آن را بازگشایی کند.");
    }
    if (expectedVersion !== undefined && cur.version !== expectedVersion) throw new ServiceError("این معامله هم‌زمان ویرایش شده است. صفحه را دوباره باز کنید.");
    const { d, expected } = await validateTx(tx, raw);
    const [row] = await tx.update(s.transactions).set({
      kind: d.kind, propertyId: d.propertyId, agentId: d.agentId ?? cur.agentId,
      dealAmount: d.dealAmount, monthlyRent: d.monthlyRent, commissionMode: d.commissionMode,
      commissionRateBp: d.commissionMode === "percent" ? d.commissionRate : null,
      commissionFixed: d.commissionMode === "fixed" ? d.commissionFixed : null,
      expectedCommission: expected, transactionDate: d.transactionDate, notes: d.notes,
      updatedAt: new Date(), version: cur.version + 1,
    }).where(and(eq(s.transactions.id, id), eq(s.transactions.version, cur.version))).returning();
    if (!row) throw new ServiceError("این معامله هم‌زمان ویرایش شده است.");
    await writeParties(tx, id, d.partyContact, d.partyRole);
    await audit(tx, actor.id, "transaction.update", "transaction", id, {
      before: { dealAmount: cur.dealAmount, expectedCommission: cur.expectedCommission }, after: { dealAmount: row.dealAmount, expectedCommission: expected },
    });
    return row;
  });
}

const TX_TRANSITIONS: Record<TxStatus, TxStatus[]> = {
  draft: ["pending", "completed", "cancelled"],
  pending: ["draft", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function changeTransactionStatus(db: DB, actor: Actor, id: number, to: TxStatus, opts: { reason?: string | null; updateProperty?: boolean } = {}) {
  assertCan(actor, "transactions.manage");
  const result = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(s.transactions).where(eq(s.transactions.id, id));
    if (!cur) throw new ServiceError("معامله پیدا نشد.");
    const from = cur.status as TxStatus;
    const reopen = (from === "completed" || from === "cancelled") && (to === "pending" || to === "draft");
    if (reopen) {
      if (actor.role !== "owner") throw new ServiceError("فقط مدیر می‌تواند معاملهٔ بسته‌شده را بازگشایی کند.");
      if (!opts.reason?.trim()) throw new ServiceError("دلیل بازگشایی را بنویسید.", { reason: "دلیل لازم است." });
    } else if (!TX_TRANSITIONS[from].includes(to)) {
      throw new ServiceError(`تغییر از «${TX_STATUSES[from]}» به «${TX_STATUSES[to]}» مجاز نیست.`);
    }
    if (to === "completed" && !cur.transactionDate) throw new ServiceError("پیش از تکمیل، تاریخ معامله را ثبت کنید.");
    if (to === "cancelled" && !opts.reason?.trim()) throw new ServiceError("دلیل لغو را بنویسید.", { reason: "دلیل لازم است." });
    const now = new Date();
    const [row] = await tx.update(s.transactions).set({
      status: to, updatedAt: now, version: cur.version + 1,
      completedAt: to === "completed" ? now : reopen ? null : cur.completedAt,
      cancelledAt: to === "cancelled" ? now : reopen ? null : cur.cancelledAt,
    }).where(and(eq(s.transactions.id, id), eq(s.transactions.version, cur.version))).returning();
    if (!row) throw new ServiceError("این معامله هم‌زمان تغییر کرده است.");
    await audit(tx, actor.id, reopen ? "transaction.reopen" : "transaction.status", "transaction", id, { from, to, reason: opts.reason ?? null });
    return row;
  });
  let propertyMessage: string | null = null;
  if (to === "completed" && opts.updateProperty && result.propertyId && result.kind !== "other") {
    try {
      await changePropertyStatus(db, actor, result.propertyId, result.kind === "sale" ? "sold" : "rented", `معاملهٔ ${result.code}`);
      propertyMessage = "وضعیت ملک هم به‌روز شد.";
    } catch (e) {
      propertyMessage = "وضعیت ملک به‌روز نشد: " + (e as Error).message;
    }
  }
  return { transaction: result, propertyMessage };
}

/** Commission received net of refunds, from recorded finance entries only. */
async function commissionReceivedFor(db: DBorTx, txIds: number[]) {
  if (!txIds.length) return new Map<number, number>();
  const rows = await db.select({
    txId: s.financeEntries.transactionId,
    net: sql<number>`coalesce(sum(case when ${s.financeEntries.kind} = 'income' then ${s.financeEntries.amount} else -${s.financeEntries.amount} end), 0)::bigint`,
  }).from(s.financeEntries)
    .innerJoin(s.financeCategories, eq(s.financeCategories.id, s.financeEntries.categoryId))
    .where(and(inArray(s.financeEntries.transactionId, txIds), eq(s.financeEntries.status, "recorded"), eq(s.financeCategories.isCommission, true)))
    .groupBy(s.financeEntries.transactionId);
  return new Map(rows.map((r) => [r.txId!, Number(r.net)]));
}

export function paymentState(expected: number, received: number): "none" | "unpaid" | "partial" | "paid" {
  if (expected <= 0) return received > 0 ? "paid" : "none";
  if (received <= 0) return "unpaid";
  return received >= expected ? "paid" : "partial";
}

export const txFilters = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(["draft", "pending", "completed", "cancelled"]).optional().catch(undefined),
  kind: z.enum(["sale", "rent", "other"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

export async function listTransactions(db: DBorTx, actor: Actor, raw: Record<string, unknown>) {
  assertCan(actor, "transactions.view");
  const f = txFilters.parse(raw);
  const conds: (SQL | undefined)[] = [];
  const q = normalizeSearch(f.q);
  if (q) conds.push(or(ilike(s.transactions.code, likePattern(q)), ilike(s.properties.ref, likePattern(q)), ilike(s.properties.title, likePattern(q))));
  if (f.status) conds.push(eq(s.transactions.status, f.status));
  if (f.kind) conds.push(eq(s.transactions.kind, f.kind));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.transactions)
    .leftJoin(s.properties, eq(s.properties.id, s.transactions.propertyId)).where(where);
  const rows = await db.select({ t: s.transactions, propertyRef: s.properties.ref, propertyTitle: s.properties.title, agentName: s.users.name })
    .from(s.transactions)
    .leftJoin(s.properties, eq(s.properties.id, s.transactions.propertyId))
    .leftJoin(s.users, eq(s.users.id, s.transactions.agentId))
    .where(where).orderBy(desc(s.transactions.createdAt)).limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE);
  const received = actor.permissions.has("finance.view") ? await commissionReceivedFor(db, rows.map((r) => r.t.id)) : null;
  return {
    rows: rows.map((r) => ({ ...r, received: received?.get(r.t.id) ?? null, payment: received ? paymentState(r.t.expectedCommission, received.get(r.t.id) ?? 0) : null })),
    total, page: f.page, filters: f,
  };
}

export async function getTransaction(db: DBorTx, actor: Actor, id: number) {
  assertCan(actor, "transactions.view");
  const [row] = await db.select({ t: s.transactions, propertyRef: s.properties.ref, propertyTitle: s.properties.title })
    .from(s.transactions).leftJoin(s.properties, eq(s.properties.id, s.transactions.propertyId)).where(eq(s.transactions.id, id));
  if (!row) throw new ServiceError("معامله پیدا نشد.");
  const parties = await db.select({ role: s.transactionParties.role, c: s.contacts }).from(s.transactionParties)
    .innerJoin(s.contacts, eq(s.contacts.id, s.transactionParties.contactId)).where(eq(s.transactionParties.transactionId, id));
  let finance: { entries: (typeof s.financeEntries.$inferSelect & { categoryName: string })[]; received: number } | null = null;
  if (actor.permissions.has("finance.view")) {
    const entries = await db.select({ e: s.financeEntries, categoryName: s.financeCategories.name }).from(s.financeEntries)
      .innerJoin(s.financeCategories, eq(s.financeCategories.id, s.financeEntries.categoryId))
      .where(eq(s.financeEntries.transactionId, id)).orderBy(desc(s.financeEntries.entryDate));
    const received = (await commissionReceivedFor(db, [id])).get(id) ?? 0;
    finance = { entries: entries.map((x) => ({ ...x.e, categoryName: x.categoryName })), received };
  }
  const history = await db.select({ a: s.auditLogs, by: s.users.name }).from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
    .where(and(eq(s.auditLogs.entity, "transaction"), eq(s.auditLogs.entityId, String(id)))).orderBy(desc(s.auditLogs.createdAt)).limit(30);
  return { ...row, parties, finance, history };
}

/* ════════════════ Finance ════════════════ */


export const financeInput = z.object({
  kind: zEnum(["income", "expense"]),
  categoryId: zId.refine((v) => v !== null, "دسته را انتخاب کنید."),
  amount: zMoneyRequired,
  entryDate: zJalaliDateRequired,
  method: z.preprocess((v) => (v === "" ? null : v), z.enum(["cash", "card", "transfer", "pos", "cheque", "other"]).nullable().optional()).transform((v) => v ?? null),
  description: zOptText(1000),
  referenceNo: zOptText(80),
  transactionId: zId,
  contactId: zId,
  idempotencyKey: z.string().uuid().optional(),
});

export async function createFinanceEntry(db: DB, actor: Actor, raw: unknown, attachment?: { storageKey: string; originalName: string; mime: string; size: number } | null) {
  assertCan(actor, "finance.manage");
  const d = parseOrThrow(financeInput, raw);
  if (d.entryDate! > todayIso()) throw new ServiceError("تاریخ ثبت نمی‌تواند در آینده باشد.", { entryDate: "تاریخ آینده مجاز نیست." });
  if (d.idempotencyKey) {
    const [dup] = await db.select({ id: s.financeEntries.id }).from(s.financeEntries).where(eq(s.financeEntries.idempotencyKey, d.idempotencyKey));
    if (dup) return { id: dup.id, duplicate: true as const };
  }
  return db.transaction(async (tx) => {
    const [cat] = await tx.select().from(s.financeCategories).where(and(eq(s.financeCategories.id, d.categoryId!), eq(s.financeCategories.kind, d.kind)));
    if (!cat || !cat.isActive) throw new ServiceError("دسته با نوع ثبت هم‌خوانی ندارد.", { categoryId: "دستهٔ نامعتبر" });
    if (cat.isCommission && !d.transactionId) throw new ServiceError("کمیسیون باید به یک معامله متصل شود.", { transactionId: "معامله را انتخاب کنید." });
    if (d.transactionId) {
      const [t] = await tx.select().from(s.transactions).where(eq(s.transactions.id, d.transactionId));
      if (!t) throw new ServiceError("معامله پیدا نشد.", { transactionId: "معامله پیدا نشد." });
      if (t.status === "cancelled" && d.kind === "income") throw new ServiceError("برای معاملهٔ لغوشده دریافت ثبت نمی‌شود.");
    }
    let attachmentId: number | null = null;
    if (attachment) {
      const [a] = await tx.insert(s.attachments).values({ ...attachment, ownerType: "finance", uploadedBy: actor.id }).returning();
      attachmentId = a.id;
    }
    const [row] = await tx.insert(s.financeEntries).values({
      kind: d.kind, categoryId: d.categoryId!, amount: d.amount, entryDate: d.entryDate!, method: d.method,
      description: d.description, referenceNo: d.referenceNo, transactionId: d.transactionId, contactId: d.contactId,
      attachmentId, idempotencyKey: d.idempotencyKey ?? null, createdBy: actor.id,
    }).returning();
    if (attachmentId) await tx.update(s.attachments).set({ ownerId: row.id }).where(eq(s.attachments.id, attachmentId));
    await audit(tx, actor.id, "finance.create", "finance", row.id, { kind: d.kind, amount: d.amount, category: cat.name, transactionId: d.transactionId });
    return { id: row.id, duplicate: false as const };
  });
}

export async function voidFinanceEntry(db: DB, actor: Actor, id: number, reason: string) {
  assertCan(actor, "finance.void");
  if (!reason.trim()) throw new ServiceError("دلیل ابطال را بنویسید.", { reason: "دلیل لازم است." });
  return db.transaction(async (tx) => {
    const [row] = await tx.update(s.financeEntries)
      .set({ status: "void", voidReason: reason.trim().slice(0, 500), voidedBy: actor.id, voidedAt: new Date() })
      .where(and(eq(s.financeEntries.id, id), eq(s.financeEntries.status, "recorded"))).returning();
    if (!row) throw new ServiceError("ثبت پیدا نشد یا قبلاً باطل شده است.");
    await audit(tx, actor.id, "finance.void", "finance", id, { amount: row.amount, reason });
    return row;
  });
}

export const financeFilters = z.object({
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  kind: z.enum(["income", "expense"]).optional().catch(undefined),
  cat: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.enum(["recorded", "void", "all"]).catch("recorded").default("recorded"),
  q: z.string().optional().catch(undefined),
  tx: z.coerce.number().int().positive().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
});

function financeWhere(f: z.infer<typeof financeFilters>, fromIso: string | null, toIso: string | null) {
  const conds: (SQL | undefined)[] = [];
  if (fromIso) conds.push(gte(s.financeEntries.entryDate, fromIso));
  if (toIso) conds.push(sql`${s.financeEntries.entryDate} <= ${toIso}`);
  if (f.kind) conds.push(eq(s.financeEntries.kind, f.kind));
  if (f.cat) conds.push(eq(s.financeEntries.categoryId, f.cat));
  if (f.status !== "all") conds.push(eq(s.financeEntries.status, f.status));
  if (f.tx) conds.push(eq(s.financeEntries.transactionId, f.tx));
  const q = normalizeSearch(f.q);
  if (q) conds.push(or(ilike(s.financeEntries.description, likePattern(q)), ilike(s.financeEntries.referenceNo, likePattern(q))));
  return and(...conds);
}

export async function listFinance(db: DBorTx, actor: Actor, raw: Record<string, unknown>, opts: { all?: boolean } = {}) {
  assertCan(actor, "finance.view");
  const f = financeFilters.parse(raw);
  const { parseJalaliDate } = await import("@/lib/format");
  const fromIso = parseJalaliDate(f.from) ?? null;
  const toIso = parseJalaliDate(f.to) ?? null;
  const where = financeWhere(f, fromIso, toIso);
  const totalsWhere = financeWhere({ ...f, status: "recorded" }, fromIso, toIso);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(s.financeEntries).where(where);
  const [sums] = await db.select({
    income: sql<number>`coalesce(sum(case when ${s.financeEntries.kind} = 'income' then ${s.financeEntries.amount} end), 0)::bigint`,
    expense: sql<number>`coalesce(sum(case when ${s.financeEntries.kind} = 'expense' then ${s.financeEntries.amount} end), 0)::bigint`,
  }).from(s.financeEntries).where(totalsWhere);
  const q = db.select({ e: s.financeEntries, categoryName: s.financeCategories.name, txCode: s.transactions.code, by: s.users.name })
    .from(s.financeEntries)
    .innerJoin(s.financeCategories, eq(s.financeCategories.id, s.financeEntries.categoryId))
    .leftJoin(s.transactions, eq(s.transactions.id, s.financeEntries.transactionId))
    .leftJoin(s.users, eq(s.users.id, s.financeEntries.createdBy))
    .where(where).orderBy(desc(s.financeEntries.entryDate), desc(s.financeEntries.id));
  const rows = opts.all ? await q.limit(20000) : await q.limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE);
  return { rows, total, page: f.page, filters: f, sums: { income: Number(sums.income), expense: Number(sums.expense) }, fromIso, toIso };
}

export async function financeCategoriesList(db: DBorTx, includeInactive = false) {
  return db.select().from(s.financeCategories).where(includeInactive ? undefined : eq(s.financeCategories.isActive, true))
    .orderBy(asc(s.financeCategories.kind), asc(s.financeCategories.sort));
}

export async function getAttachmentForActor(db: DBorTx, actor: Actor, id: number) {
  const [a] = await db.select().from(s.attachments).where(eq(s.attachments.id, id));
  if (!a) throw new ServiceError("فایل پیدا نشد.");
  if (a.ownerType === "finance") assertCan(actor, "finance.view");
  else if (a.ownerType === "transaction") assertCan(actor, "transactions.view");
  else assertCan(actor, "properties.view");
  return a;
}

/* ════════════════ Reports ════════════════ */

export async function financeReport(db: DBorTx, actor: Actor, fromIso: string, toIsoExclusive: string) {
  assertCan(actor, "reports.finance");
  const inRange = and(eq(s.financeEntries.status, "recorded"), gte(s.financeEntries.entryDate, fromIso), lt(s.financeEntries.entryDate, toIsoExclusive));
  const byCategory = await db.select({
    kind: s.financeEntries.kind, category: s.financeCategories.name, isCommission: s.financeCategories.isCommission,
    total: sql<number>`sum(${s.financeEntries.amount})::bigint`, count: sql<number>`count(*)::int`,
  }).from(s.financeEntries).innerJoin(s.financeCategories, eq(s.financeCategories.id, s.financeEntries.categoryId))
    .where(inRange).groupBy(s.financeEntries.kind, s.financeCategories.name, s.financeCategories.isCommission)
    .orderBy(s.financeEntries.kind, desc(sql`sum(${s.financeEntries.amount})`));
  const cats = byCategory.map((r) => ({ ...r, total: Number(r.total) }));
  const income = cats.filter((c) => c.kind === "income").reduce((a, c) => a + c.total, 0);
  const expense = cats.filter((c) => c.kind === "expense").reduce((a, c) => a + c.total, 0);
  const commissionIn = cats.filter((c) => c.kind === "income" && c.isCommission).reduce((a, c) => a + c.total, 0);
  const commissionRefunds = cats.filter((c) => c.kind === "expense" && c.isCommission).reduce((a, c) => a + c.total, 0);
  return { income, expense, net: income - expense, commissionReceivedNet: commissionIn - commissionRefunds, byCategory: cats };
}

/** Outstanding commission across all non-cancelled transactions (not date-bound: a balance). */
export async function commissionReceivables(db: DBorTx, actor: Actor) {
  assertCan(actor, "reports.finance");
  const txs = await db.select({ id: s.transactions.id, code: s.transactions.code, status: s.transactions.status, expected: s.transactions.expectedCommission, propertyRef: s.properties.ref })
    .from(s.transactions).leftJoin(s.properties, eq(s.properties.id, s.transactions.propertyId))
    .where(and(sql`${s.transactions.status} <> 'cancelled'`, sql`${s.transactions.expectedCommission} > 0`));
  const received = await commissionReceivedFor(db, txs.map((t) => t.id));
  const rows = txs.map((t) => {
    const r = received.get(t.id) ?? 0;
    return { ...t, received: r, outstanding: Math.max(t.expected - r, 0) };
  }).filter((t) => t.outstanding > 0);
  return { rows, totalExpected: txs.reduce((a, t) => a + t.expected, 0), totalReceived: [...received.values()].reduce((a, b) => a + b, 0), totalOutstanding: rows.reduce((a, t) => a + t.outstanding, 0) };
}

export async function monthlyFinance(db: DBorTx, actor: Actor, months: { label: string; from: string; to: string }[]) {
  assertCan(actor, "reports.finance");
  const out = [];
  for (const m of months) {
    const [r] = await db.select({
      income: sql<number>`coalesce(sum(case when ${s.financeEntries.kind}='income' then ${s.financeEntries.amount} end),0)::bigint`,
      expense: sql<number>`coalesce(sum(case when ${s.financeEntries.kind}='expense' then ${s.financeEntries.amount} end),0)::bigint`,
    }).from(s.financeEntries).where(and(eq(s.financeEntries.status, "recorded"), gte(s.financeEntries.entryDate, m.from), lt(s.financeEntries.entryDate, m.to)));
    out.push({ label: m.label, income: Number(r.income), expense: Number(r.expense), net: Number(r.income) - Number(r.expense) });
  }
  return out;
}

export async function operationsReport(db: DBorTx, actor: Actor, from: Date, toExclusive: Date) {
  assertCan(actor, "reports.view");
  const inventory = await db.select({ category: s.propertyCategories.name, status: s.properties.status, deal: s.properties.dealType, n: sql<number>`count(*)::int` })
    .from(s.properties).innerJoin(s.propertyCategories, eq(s.propertyCategories.id, s.properties.categoryId))
    .groupBy(s.propertyCategories.name, s.properties.status, s.properties.dealType);
  const inqRange = and(gte(s.inquiries.createdAt, from), lt(s.inquiries.createdAt, toExclusive));
  const inqByStatus = await db.select({ status: s.inquiries.status, n: sql<number>`count(*)::int` }).from(s.inquiries).where(inqRange).groupBy(s.inquiries.status);
  const inqBySource = await db.select({ source: s.inquiries.source, n: sql<number>`count(*)::int` }).from(s.inquiries).where(inqRange).groupBy(s.inquiries.source);
  const workload = await db.select({
    name: s.users.name,
    openInquiries: sql<number>`(select count(*)::int from inquiries i where i.agent_id = ${s.users.id} and i.status in ('new','contacted','follow_up','visit_scheduled','negotiation'))`,
    activeListings: sql<number>`(select count(*)::int from properties p where p.agent_id = ${s.users.id} and p.status in ('published','reserved'))`,
    openFollowups: sql<number>`(select count(*)::int from followups f where f.assigned_to = ${s.users.id} and f.done = false)`,
  }).from(s.users).where(eq(s.users.isActive, true));
  const fupRange = and(gte(s.followups.dueAt, from), lt(s.followups.dueAt, toExclusive));
  const [fups] = await db.select({
    total: sql<number>`count(*)::int`,
    done: sql<number>`count(*) filter (where ${s.followups.done})::int`,
    overdue: sql<number>`count(*) filter (where not ${s.followups.done} and ${s.followups.dueAt} < now())::int`,
  }).from(s.followups).where(fupRange);
  const txRange = and(sql`${s.transactions.transactionDate} >= ${from.toISOString().slice(0, 10)}`, sql`${s.transactions.transactionDate} < ${toExclusive.toISOString().slice(0, 10)}`);
  const txSummary = await db.select({
    kind: s.transactions.kind, status: s.transactions.status, n: sql<number>`count(*)::int`,
    deal: sql<number>`coalesce(sum(${s.transactions.dealAmount}),0)::bigint`, expected: sql<number>`coalesce(sum(${s.transactions.expectedCommission}),0)::bigint`,
  }).from(s.transactions).where(txRange).groupBy(s.transactions.kind, s.transactions.status);
  const inqTotal = inqByStatus.reduce((a, r) => a + r.n, 0);
  const converted = inqByStatus.find((r) => r.status === "converted")?.n ?? 0;
  return {
    inventory, inqByStatus, inqBySource, workload, followups: fups,
    txSummary: txSummary.map((t) => ({ ...t, deal: Number(t.deal), expected: Number(t.expected) })),
    conversion: { total: inqTotal, converted, rate: inqTotal ? converted / inqTotal : 0 },
  };
}
