import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DB } from "@/server/db";
import * as s from "@/server/db/schema";
import { categoryId, financeCategory, freshDb, makeActor, pngBuffer, propertyForm } from "./helpers";
import type { Actor } from "@/server/services/common";
import {
  addPropertyImage, changePropertyStatus, createProperty, getPublicProperty, listAdminProperties, parsePublicSearch,
  publishProblems, searchPublicProperties, updateProperty, isPublicImageKey, duplicateProperty, setFeatured,
} from "@/server/services/properties";
import {
  createPublicInquiry, getInquiry, listInquiries, setInquiryStatus, createContactFromInquiry, saveContact, createFollowup,
  linkInquiryTransaction, assignInquiry,
} from "@/server/services/crm";
import {
  changeTransactionStatus, commissionReceivables, createFinanceEntry, createTransaction, financeReport, getTransaction,
  listFinance, updateTransaction, voidFinanceEntry,
} from "@/server/services/deals";
import { verifyLogin, createUser, setRolePermissions, dashboardStats } from "@/server/services/admin";

let db: DB;
let owner: Actor, agent: Actor, finance: Actor, content: Actor;
let apt: number, land: number;

beforeAll(async () => {
  db = await freshDb();
  owner = await makeActor(db, "owner");
  agent = await makeActor(db, "agent");
  finance = await makeActor(db, "finance");
  content = await makeActor(db, "content");
  apt = await categoryId(db, "apartment");
  land = await categoryId(db, "land");
});

async function publishedProperty(overrides: Record<string, unknown> = {}) {
  const p = await createProperty(db, owner, propertyForm({ categoryId: String(apt), ...overrides }));
  await addPropertyImage(db, owner, p.id, await pngBuffer(), "نما");
  return changePropertyStatus(db, owner, p.id, "published");
}

describe("property lifecycle and publication", () => {
  it("creates a draft with a sequential public reference", async () => {
    const p = await createProperty(db, owner, propertyForm({ categoryId: String(apt) }));
    expect(p.status).toBe("draft");
    expect(p.ref).toMatch(/^M-14\d\d-\d{4}$/);
    expect(p.price).toBe(4_850_000_000);
  });

  it("validates input on the server", async () => {
    await expect(createProperty(db, owner, propertyForm({ categoryId: String(apt), price: "abc" }))).rejects.toThrow();
    await expect(createProperty(db, owner, propertyForm({ categoryId: String(apt), floor: "9", totalFloors: "4" }))).rejects.toThrow(/طبقه/);
    await expect(createProperty(db, owner, propertyForm({ categoryId: "" }))).rejects.toThrow();
  });

  it("ignores bedrooms for land", async () => {
    const p = await createProperty(db, owner, propertyForm({ categoryId: String(land), bedrooms: "3", title: "زمین ۵۰۰ متری" }));
    expect(p.bedrooms).toBeNull();
  });

  it("refuses to publish until requirements are met, then publishes", async () => {
    const p = await createProperty(db, owner, propertyForm({ categoryId: String(apt) }));
    expect(await publishProblems(db, p.id)).toContain("دست‌کم یک عکس");
    await expect(changePropertyStatus(db, owner, p.id, "published")).rejects.toThrow(/انتشار/);
    expect(await getPublicProperty(db, p.ref)).toBeNull();
    await addPropertyImage(db, owner, p.id, await pngBuffer(), null);
    const pub = await changePropertyStatus(db, owner, p.id, "published");
    expect(pub.status).toBe("published");
    expect(pub.publishedAt).not.toBeNull();
    const pubView = await getPublicProperty(db, p.ref);
    expect(pubView?.title).toBe(p.title);
    // Private fields never leave the server
    expect(JSON.stringify(pubView)).not.toContain("نشانی خصوصی");
    expect(JSON.stringify(pubView)).not.toContain("محرمانه");
    expect(pubView).not.toHaveProperty("address");
    expect(pubView).not.toHaveProperty("ownerContactId");
    // Unpublish removes it from the public site
    await changePropertyStatus(db, owner, p.id, "unpublished");
    expect(await getPublicProperty(db, p.ref)).toBeNull();
    const hist = await db.select().from(s.propertyStatusHistory).where(eq(s.propertyStatusHistory.propertyId, p.id));
    expect(hist.map((h) => h.toStatus)).toEqual(["draft", "published", "unpublished"]);
  });

  it("rejects invalid transitions and keeps sold pages reachable but unlisted", async () => {
    const p = await publishedProperty({ title: "خانهٔ تست فروش" });
    await expect(changePropertyStatus(db, owner, p.id, "pending_review")).rejects.toThrow(/مجاز نیست/);
    await changePropertyStatus(db, owner, p.id, "sold");
    expect((await getPublicProperty(db, p.ref))?.status).toBe("sold");
    const res = await searchPublicProperties(db, parsePublicSearch({ q: "خانهٔ تست فروش" }));
    expect(res.total).toBe(0);
  });

  it("serves images publicly only for public listings", async () => {
    const p = await createProperty(db, owner, propertyForm({ categoryId: String(apt) }));
    const img = await addPropertyImage(db, owner, p.id, await pngBuffer(), null);
    expect(await isPublicImageKey(db, img.storageKey)).toBe(false);
    await changePropertyStatus(db, owner, p.id, "published");
    expect(await isPublicImageKey(db, img.thumbKey)).toBe(true);
    await expect(addPropertyImage(db, owner, p.id, Buffer.from("not an image"), null)).rejects.toThrow(/عکس/);
  });

  it("detects concurrent edits", async () => {
    const p = await createProperty(db, owner, propertyForm({ categoryId: String(apt) }));
    await updateProperty(db, owner, p.id, propertyForm({ categoryId: String(apt), title: "ویرایش اول" }), p.version);
    await expect(updateProperty(db, owner, p.id, propertyForm({ categoryId: String(apt), title: "ویرایش دوم" }), p.version)).rejects.toThrow(/هم‌زمان/);
  });

  it("duplicates as a new draft and only features public listings", async () => {
    const p = await publishedProperty();
    const copy = await duplicateProperty(db, owner, p.id);
    expect(copy.status).toBe("draft");
    expect(copy.ref).not.toBe(p.ref);
    await expect(setFeatured(db, owner, copy.id, true)).rejects.toThrow();
    await setFeatured(db, owner, p.id, true);
  });
});

describe("role-based access", () => {
  it("agent can draft and submit for review but not publish", async () => {
    const p = await createProperty(db, agent, propertyForm({ categoryId: String(apt), agentId: String(owner.id) }));
    expect(p.agentId).toBe(agent.id); // agents cannot assign listings to others
    await addPropertyImage(db, agent, p.id, await pngBuffer(), null);
    await changePropertyStatus(db, agent, p.id, "pending_review");
    await expect(changePropertyStatus(db, agent, p.id, "published")).rejects.toThrow(/مجاز نیست/);
    await changePropertyStatus(db, content, p.id, "published");
  });

  it("agent only sees own listings", async () => {
    const mine = await listAdminProperties(db, agent, {});
    expect(mine.rows.every((r) => r.p.agentId === agent.id || r.p.createdBy === agent.id)).toBe(true);
    const all = await listAdminProperties(db, owner, {});
    expect(all.total).toBeGreaterThan(mine.total);
  });

  it("finance cannot edit properties; agent and content cannot touch finance", async () => {
    await expect(createProperty(db, finance, propertyForm({ categoryId: String(apt) }))).rejects.toThrow(/اجازه/);
    await expect(listFinance(db, agent, {})).rejects.toThrow(/اجازه/);
    await expect(listFinance(db, content, {})).rejects.toThrow(/اجازه/);
    await expect(financeReport(db, agent, "2026-01-01", "2027-01-01")).rejects.toThrow(/اجازه/);
    await expect(createUser(db, agent, { name: "x", username: "xyz", role: "owner", isActive: "on" }, "long-password-1")).rejects.toThrow(/اجازه/);
  });

  it("dashboard hides nothing it should not compute", async () => {
    const d = await dashboardStats(db, finance);
    expect(d.recentInquiries).toEqual([]); // finance role has no inquiries.view by default
  });

  it("owner role keeps lock-out-protected permissions", async () => {
    await setRolePermissions(db, owner, "owner", []);
    const rows = await db.select().from(s.rolePermissions).where(eq(s.rolePermissions.role, "owner"));
    expect(rows.map((r) => r.permission)).toEqual(expect.arrayContaining(["users.manage", "settings.manage"]));
    // restore full owner rights for remaining tests
    const { ALL_PERMISSIONS } = await import("@/server/auth/permissions");
    await setRolePermissions(db, owner, "owner", ALL_PERMISSIONS);
  });
});

describe("authentication", () => {
  it("verifies credentials, locks after repeated failures", async () => {
    await createUser(db, owner, { name: "کاربر آزمایشی", username: "login.test", role: "agent", isActive: "on" }, "correct-horse-9");
    expect((await verifyLogin(db, "Login.Test", "correct-horse-9", "ip1")).username).toBe("login.test");
    for (let i = 0; i < 5; i++) await expect(verifyLogin(db, "login.test", "wrong", "ip2")).rejects.toThrow();
    await expect(verifyLogin(db, "login.test", "correct-horse-9", "ip3")).rejects.toThrow(/قفل/);
    await expect(verifyLogin(db, "nobody", "x", "ip4")).rejects.toThrow(/درست نیست/);
  });
  it("enforces password policy", async () => {
    await expect(createUser(db, owner, { name: "a", username: "short.pw", role: "agent", isActive: "on" }, "123")).rejects.toThrow(/۱۰/);
  });
});

describe("public search", () => {
  it("filters, sorts and paginates on stored data and validates params", async () => {
    await publishedProperty({ title: "زمین مسکونی ۳۰۰ متری", categoryId: String(land), price: "900000000", area: "300", neighborhood: "کوی مسعود" });
    await publishedProperty({ title: "آپارتمان ارزان", price: "1500000000", area: "70", neighborhood: "کوی مسعود" });
    const byCat = await searchPublicProperties(db, parsePublicSearch({ cat: "land" }));
    expect(byCat.items.every((i) => i.categorySlug === "land")).toBe(true);
    const cheap = await searchPublicProperties(db, parsePublicSearch({ maxPrice: "1600000000", sort: "price_asc" }));
    expect(cheap.items.length).toBeGreaterThan(0);
    expect(cheap.items.every((i) => (i.price ?? 0) <= 1_600_000_000)).toBe(true);
    const prices = cheap.items.map((i) => i.price ?? 0);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    const hood = await searchPublicProperties(db, parsePublicSearch({ hood: "کوی مسعود" }));
    expect(hood.total).toBe(2);
    // malformed params fall back to safe defaults instead of throwing
    const bad = parsePublicSearch({ minPrice: "abc", sort: "drop table", page: "-4", cat: "'; --" });
    expect(bad).toMatchObject({ sort: "newest", page: 1, minPrice: undefined, cat: undefined });
    await expect(searchPublicProperties(db, bad)).resolves.toBeTruthy();
  });
});

describe("inquiries and CRM", () => {
  it("persists a public inquiry linked to its property and exposes it to staff", async () => {
    const p = await publishedProperty({ title: "ملک برای درخواست" });
    const inq = await createPublicInquiry(db, { name: "مشتری آزمایشی", phone: "۰۹۱۲۱۲۳۴۵۶۷", message: "سلام", propertyRef: p.ref, consent: "on", website: "" }, "ip-a");
    const detail = await getInquiry(db, owner, inq.id);
    expect(detail.i.propertyId).toBe(p.id);
    expect(detail.i.phone).toBe("09121234567");
    expect((await listInquiries(db, owner, { open: "1" })).rows.some((r) => r.i.id === inq.id)).toBe(true);
  });

  it("rejects bots and missing consent, and rate-limits", async () => {
    await expect(createPublicInquiry(db, { name: "x", phone: "09121112233", consent: "on", website: "spam" }, "ip-b")).rejects.toThrow();
    await expect(createPublicInquiry(db, { name: "x", phone: "09121112233" }, "ip-b")).rejects.toMatchObject({ fieldErrors: { consent: expect.stringMatching(/موافقت/) } });
    for (let i = 0; i < 5; i++) await createPublicInquiry(db, { name: "x", phone: `0912000000${i}`, consent: "on" }, "ip-c");
    await expect(createPublicInquiry(db, { name: "x", phone: "09120000009", consent: "on" }, "ip-c")).rejects.toThrow(/زیاد/);
  });

  it("links inquiries to contacts by exact phone and supports the follow-up workflow", async () => {
    const c = await saveContact(db, owner, { fullName: "خریدار ثبت‌شده", phone: "09131112233", types: ["buyer"], status: "active" });
    await expect(saveContact(db, owner, { fullName: "شخص دیگر", phone: "۰۹۱۳۱۱۱۲۲۳۳", types: ["buyer"], status: "active" })).rejects.toThrow(/تکراری|همین شماره/);
    const inq = await createPublicInquiry(db, { name: "نام متفاوت", phone: "09131112233", consent: "on" }, "ip-d");
    expect((await getInquiry(db, owner, inq.id)).i.contactId).toBe(c.id);

    const inq2 = await createPublicInquiry(db, { name: "مشتری تازه", phone: "09135556677", consent: "on" }, "ip-e");
    await assignInquiry(db, owner, inq2.id, agent.id);
    await setInquiryStatus(db, agent, inq2.id, "contacted");
    const newContact = await createContactFromInquiry(db, agent, inq2.id);
    await createFollowup(db, agent, { purpose: "هماهنگی بازدید", dueAt: new Date(Date.now() + 86400000), inquiryId: String(inq2.id), contactId: String(newContact.id) });
    const d = await getInquiry(db, agent, inq2.id);
    expect(d.contact?.id).toBe(newContact.id);
    expect(d.followups).toHaveLength(1);
    expect(d.activities.length).toBeGreaterThanOrEqual(4);
  });
});

describe("transactions and finance", () => {
  it("computes commission on the server, records receipts separately, and reports consistently", async () => {
    const p = await publishedProperty({ title: "ملک معامله" });
    const buyer = await saveContact(db, owner, { fullName: "خریدار معامله", phone: "09139998877", types: ["buyer"], status: "active" });
    const tx = await createTransaction(db, agent, {
      kind: "sale", propertyId: String(p.id), dealAmount: "2,000,000,000", commissionMode: "percent", commissionRate: "۰٫۵",
      transactionDate: "1405/08/01", partyContact: [String(buyer.id)], partyRole: ["buyer"],
    });
    expect(tx.expectedCommission).toBe(10_000_000);
    expect(tx.dealAmount).toBe(2_000_000_000);

    // Agent cannot record money
    await expect(createFinanceEntry(db, agent, { kind: "income", categoryId: String(await financeCategory(db, "income", true)), amount: "1", entryDate: "1405/08/01", transactionId: String(tx.id) })).rejects.toThrow(/اجازه/);

    const commissionCat = await financeCategory(db, "income", true);
    const key = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const e1 = await createFinanceEntry(db, finance, { kind: "income", categoryId: String(commissionCat), amount: "۶٬۰۰۰٬۰۰۰", entryDate: "1405/08/02", transactionId: String(tx.id), idempotencyKey: key });
    const again = await createFinanceEntry(db, finance, { kind: "income", categoryId: String(commissionCat), amount: "6000000", entryDate: "1405/08/02", transactionId: String(tx.id), idempotencyKey: key });
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(e1.id);
    await expect(createFinanceEntry(db, finance, { kind: "income", categoryId: String(commissionCat), amount: "100", entryDate: "1405/08/02" })).rejects.toThrow(/معامله/);
    await expect(createFinanceEntry(db, finance, { kind: "expense", categoryId: String(commissionCat), amount: "100", entryDate: "1405/08/02" })).rejects.toThrow(/هم‌خوانی/);

    const expenseCat = await financeCategory(db, "expense", false);
    await createFinanceEntry(db, finance, { kind: "expense", categoryId: String(expenseCat), amount: "1500000", entryDate: "1405/08/03" });

    const rec = await commissionReceivables(db, owner);
    const row = rec.rows.find((r) => r.id === tx.id)!;
    expect(row.received).toBe(6_000_000);
    expect(row.outstanding).toBe(4_000_000);

    const rep = await financeReport(db, owner, "2026-10-01", "2026-11-01");
    expect(rep.income).toBe(6_000_000);
    expect(rep.expense).toBe(1_500_000);
    expect(rep.net).toBe(4_500_000);
    // Transaction value is never counted as brokerage income
    expect(rep.income).toBeLessThan(2_000_000_000);

    const list = await listFinance(db, owner, { from: "1405/08/01", to: "1405/08/30" });
    expect(list.sums).toEqual({ income: 6_000_000, expense: 1_500_000 });

    // Void instead of delete; totals follow
    await voidFinanceEntry(db, finance, e1.id, "ثبت اشتباه");
    await expect(voidFinanceEntry(db, finance, e1.id, "دوباره")).rejects.toThrow();
    const rep2 = await financeReport(db, owner, "2026-10-01", "2026-11-01");
    expect(rep2.income).toBe(0);
    const [stillThere] = await db.select().from(s.financeEntries).where(eq(s.financeEntries.id, e1.id));
    expect(stillThere.status).toBe("void");

    // Completing locks the record and can update the property
    const done = await changeTransactionStatus(db, owner, tx.id, "completed", { updateProperty: true });
    expect(done.transaction.status).toBe("completed");
    expect((await getPublicProperty(db, p.ref))?.status).toBe("sold");
    await expect(updateTransaction(db, owner, tx.id, { kind: "sale", commissionMode: "fixed", commissionFixed: "1" })).rejects.toThrow(/قابل ویرایش نیست/);
    await expect(changeTransactionStatus(db, agent, tx.id, "pending", { reason: "x" })).rejects.toThrow(/فقط مدیر/);
    const audit = await getTransaction(db, owner, tx.id);
    expect(audit.history.length).toBeGreaterThanOrEqual(2);

    // Linking a converted inquiry
    const inq = await createPublicInquiry(db, { name: "خریدار", phone: "09139998877", consent: "on" }, "ip-f");
    await linkInquiryTransaction(db, owner, inq.id, tx.id);
    expect((await getInquiry(db, owner, inq.id)).i.status).toBe("converted");
  });

  it("rejects future dates and zero amounts", async () => {
    const cat = await financeCategory(db, "expense", false);
    await expect(createFinanceEntry(db, finance, { kind: "expense", categoryId: String(cat), amount: "0", entryDate: "1405/08/01" })).rejects.toThrow();
    await expect(createFinanceEntry(db, finance, { kind: "expense", categoryId: String(cat), amount: "10", entryDate: "1499/01/01" })).rejects.toThrow(/آینده/);
  });
});
