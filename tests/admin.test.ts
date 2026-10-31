import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db";
import * as s from "@/server/db/schema";
import { categoryId, financeCategory, freshDb, makeActor, pngBuffer, propertyForm } from "./helpers";
import { PermissionError, type Actor } from "@/server/services/common";
import { addPropertyImage, changePropertyStatus, createProperty, getPropertyForActor } from "@/server/services/properties";
import { createPublicInquiry, listInquiries, saveContact, createFollowup, completeFollowup, listFollowups } from "@/server/services/crm";
import { changeTransactionStatus, createFinanceEntry, createTransaction, listFinance, updateTransaction, voidFinanceEntry } from "@/server/services/deals";
import { exportDataset } from "@/server/services/exports";
import { readSettings, saveSettingsGroup } from "@/server/services/settings";
import { createUser, updateUser, verifyLogin, setUserPassword } from "@/server/services/admin";
import { parseJalaliDateTime } from "@/lib/format";

let db: DB;
let owner: Actor, agent: Actor, finance: Actor, content: Actor;
let apt: number;

beforeAll(async () => {
  db = await freshDb();
  owner = await makeActor(db, "owner");
  agent = await makeActor(db, "agent");
  finance = await makeActor(db, "finance");
  content = await makeActor(db, "content");
  apt = await categoryId(db, "apartment");
});

describe("CSV export", () => {
  it("requires the export permission and the dataset's view permission", async () => {
    await expect(exportDataset(db, content, "contacts", {})).rejects.toBeInstanceOf(PermissionError);
    await expect(exportDataset(db, agent, "finance", {})).rejects.toBeInstanceOf(PermissionError);
    await expect(exportDataset(db, owner, "nope", {})).rejects.toThrow();
  });

  it("neutralises formulas and never exports private property fields", async () => {
    await saveContact(db, owner, { fullName: "=HYPERLINK(\"x\")", phone: "09130000101", types: ["buyer"], status: "active" });
    const c = await exportDataset(db, owner, "contacts", {});
    expect(c.csv.startsWith("﻿")).toBe(true);
    expect(c.csv).toContain(`"'=HYPERLINK(""x"")"`);
    await createProperty(db, owner, propertyForm({ categoryId: String(apt) }));
    const p = await exportDataset(db, owner, "properties", {});
    expect(p.csv).not.toContain("نشانی خصوصی مالک");
    expect(p.csv).not.toContain("یادداشت داخلی محرمانه");
  });

  it("applies the agent's listing scope", async () => {
    await createProperty(db, agent, propertyForm({ categoryId: String(apt), title: "آگهی مشاور برای خروجی" }));
    const agentWithExport: Actor = { ...agent, permissions: new Set([...agent.permissions, "export.data"]) };
    const out = await exportDataset(db, agentWithExport, "properties", {});
    expect(out.rows).toBe(1);
    expect(out.csv).toContain("آگهی مشاور برای خروجی");
  });

  it("exports finance with the same filters as the list and labels amounts in toman", async () => {
    const [t] = [await createTransaction(db, owner, { kind: "sale", commissionMode: "fixed", commissionFixed: "1000000", partyContact: [], partyRole: [] })];
    const cat = await financeCategory(db, "income", true);
    const a = await createFinanceEntry(db, finance, { kind: "income", categoryId: String(cat), amount: "400000", entryDate: "1404/01/10", transactionId: String(t.id) });
    await createFinanceEntry(db, finance, { kind: "income", categoryId: String(cat), amount: "100000", entryDate: "1404/01/11", transactionId: String(t.id) });
    await voidFinanceEntry(db, owner, a.id, "ثبت اشتباه");
    const recorded = await exportDataset(db, finance, "finance", { status: "recorded" });
    expect(recorded.rows).toBe(1);
    expect(recorded.csv).toContain("مبلغ (تومان)");
    const all = await exportDataset(db, finance, "finance", { status: "all" });
    expect(all.rows).toBe(2);
    expect(all.csv).toContain("باطل");
    const list = await listFinance(db, finance, { tx: String(t.id), status: "all" });
    expect(list.sums.income).toBe(100000); // void entries never count
  });
});

describe("settings", () => {
  it("validates groups and persists changes", async () => {
    await expect(saveSettingsGroup(db, agent, "business", {})).rejects.toBeInstanceOf(PermissionError);
    await expect(saveSettingsGroup(db, owner, "refs", { propertyPrefix: "m1", transactionPrefix: "T" })).rejects.toThrow();
    await expect(saveSettingsGroup(db, owner, "refs", { propertyPrefix: "T", transactionPrefix: "T" })).rejects.toThrow();
    await expect(saveSettingsGroup(db, owner, "unknown", {})).rejects.toThrow();
    await saveSettingsGroup(db, owner, "currency", { display: "rial" });
    await saveSettingsGroup(db, owner, "publishing", { requireImage: "on" });
    const st = await readSettings(db);
    expect(st.currency.display).toBe("rial");
    expect(st.publishing).toEqual({ requireImage: true, requireDescription: false });
    expect(st.business.phone).toBe("09136189808");
    await saveSettingsGroup(db, owner, "currency", { display: "toman" });
  });
});

describe("users", () => {
  it("creates staff, deactivation blocks login, and the last owner cannot be demoted", async () => {
    const u = await createUser(db, owner, { name: "کارمند", username: "Staff.One", role: "agent", isActive: "on" }, "staff-password-1");
    await expect(createUser(db, owner, { name: "x", username: "staff.one", role: "agent", isActive: "on" }, "staff-password-1")).rejects.toThrow();
    await expect(createUser(db, agent, { name: "x", username: "hacker", role: "owner", isActive: "on" }, "staff-password-1")).rejects.toBeInstanceOf(PermissionError);
    expect((await verifyLogin(db, "staff.one", "staff-password-1", "t-ip")).id).toBe(u.id);
    await updateUser(db, owner, u.id, { name: "کارمند", role: "agent" }); // unchecked isActive → inactive
    await expect(verifyLogin(db, "staff.one", "staff-password-1", "t-ip")).rejects.toThrow();
    await expect(updateUser(db, owner, owner.id, { name: "مدیر", role: "agent", isActive: "on" })).rejects.toThrow(/مدیر فعال/);
    await expect(setUserPassword(db, owner, u.id, "1234567890")).rejects.toThrow();
  });
});

describe("transaction status rules", () => {
  it("requires reasons, locks completed deals, owner-only reopen, marks the property", async () => {
    const p = await createProperty(db, owner, propertyForm({ categoryId: String(apt) }));
    await addPropertyImage(db, owner, p.id, await pngBuffer(), null);
    await changePropertyStatus(db, owner, p.id, "published");
    const t = await createTransaction(db, owner, { kind: "sale", propertyId: String(p.id), dealAmount: "5000000000", commissionMode: "percent", commissionRate: "0.5", partyContact: [], partyRole: [] });
    expect(t.expectedCommission).toBe(25_000_000);
    await expect(changeTransactionStatus(db, owner, t.id, "completed")).rejects.toThrow(/تاریخ/);
    await updateTransaction(db, owner, t.id, { kind: "sale", propertyId: String(p.id), dealAmount: "5000000000", commissionMode: "percent", commissionRate: "0.5", transactionDate: "1404/02/01", partyContact: [], partyRole: [] });
    await expect(changeTransactionStatus(db, owner, t.id, "cancelled")).rejects.toThrow(/دلیل/);
    const done = await changeTransactionStatus(db, owner, t.id, "completed", { updateProperty: true });
    expect(done.transaction.status).toBe("completed");
    expect((await getPropertyForActor(db, owner, p.id)).status).toBe("sold");
    await expect(updateTransaction(db, owner, t.id, { kind: "sale", commissionMode: "fixed", partyContact: [], partyRole: [] })).rejects.toThrow();
    const agentTx: Actor = { ...agent, permissions: new Set([...agent.permissions, "transactions.manage"]) };
    await expect(changeTransactionStatus(db, agentTx, t.id, "pending", { reason: "اصلاح" })).rejects.toThrow(/مدیر/);
    await expect(changeTransactionStatus(db, owner, t.id, "pending")).rejects.toThrow(/دلیل/);
    const reopened = await changeTransactionStatus(db, owner, t.id, "pending", { reason: "اصلاح مبلغ" });
    expect(reopened.transaction.status).toBe("pending");
    const [log] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "transaction.reopen"));
    expect(log.details).toMatchObject({ reason: "اصلاح مبلغ" });
  });
});

describe("follow-ups from Jalali input", () => {
  it("stores Tehran-local due times and supports done/overdue views", async () => {
    const due = parseJalaliDateTime("1404/01/01", "10:30");
    expect(due?.toISOString()).toBe("2025-03-21T07:00:00.000Z");
    expect(parseJalaliDateTime("1404/13/01", "10:00")).toBeUndefined();
    expect(parseJalaliDateTime("1404/01/01", "25:00")).toBeUndefined();
    const f = await createFollowup(db, owner, { purpose: "تماس پیگیری", dueAt: due });
    expect((await listFollowups(db, owner, "overdue")).some((r) => r.f.id === f.id)).toBe(true);
    await completeFollowup(db, owner, f.id, true);
    expect((await listFollowups(db, owner, "done")).some((r) => r.f.id === f.id)).toBe(true);
    await expect(listFollowups(db, finance, "open")).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("inquiry scope", () => {
  it("agents see their own and unassigned inquiries only", async () => {
    await createPublicInquiry(db, { name: "الف", phone: "09130000201", consent: "on", ts: Date.now() - 5000 }, "scope-ip-1");
    const res = await listInquiries(db, agent, {});
    expect(res.rows.every((r) => r.i.agentId === null || r.i.agentId === agent.id)).toBe(true);
  });
});
