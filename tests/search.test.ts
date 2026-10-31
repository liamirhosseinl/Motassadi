import { beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/server/db";
import { categoryId, financeCategory, freshDb, makeActor, propertyForm } from "./helpers";
import type { Actor } from "@/server/services/common";
import { createProperty } from "@/server/services/properties";
import { saveContact } from "@/server/services/crm";
import { createFinanceEntry, createTransaction } from "@/server/services/deals";
import { globalSearch } from "@/server/services/search";

let db: DB;
let owner: Actor, agent: Actor, finance: Actor, content: Actor;

beforeAll(async () => {
  db = await freshDb();
  owner = await makeActor(db, "owner");
  agent = await makeActor(db, "agent");
  finance = await makeActor(db, "finance");
  content = await makeActor(db, "content");
  const apt = await categoryId(db, "apartment");
  await createProperty(db, owner, propertyForm({ categoryId: String(apt), title: "آپارتمان سراسری مدیر" }));
  await createProperty(db, agent, propertyForm({ categoryId: String(apt), title: "آپارتمان سراسری مشاور" }));
  await saveContact(db, owner, { fullName: "مخاطب سراسری", phone: "09130007788", types: ["buyer"], status: "active" });
  const t = await createTransaction(db, owner, { kind: "sale", commissionMode: "fixed", commissionFixed: "1000000", partyContact: [], partyRole: [], notes: "" });
  const cat = await financeCategory(db, "income", true);
  await createFinanceEntry(db, finance, { kind: "income", categoryId: String(cat), amount: "500000", entryDate: "1404/02/01", transactionId: String(t.id), referenceNo: "REF-سراسری-1", description: "کمیسیون سراسری" });
});

describe("global admin search", () => {
  it("requires at least two characters", async () => {
    expect((await globalSearch(db, owner, "a")).sections).toBeNull();
    expect((await globalSearch(db, owner, undefined)).sections).toBeNull();
  });

  it("finds records across modules for the owner", async () => {
    const r = await globalSearch(db, owner, "سراسری");
    expect(r.sections!.properties!.total).toBe(2);
    expect(r.sections!.contacts!.total).toBe(1);
    expect(r.sections!.finance!.total).toBe(1);
    const byPhone = await globalSearch(db, owner, "۷۷۸۸");
    expect(byPhone.sections!.contacts!.total).toBe(1);
  });

  it("applies each module's permissions and the agent's listing scope", async () => {
    const a = await globalSearch(db, agent, "سراسری");
    expect(a.sections!.finance).toBeNull();
    expect(a.sections!.properties!.total).toBe(1);
    expect(a.sections!.properties!.rows[0].p.title).toBe("آپارتمان سراسری مشاور");

    const c = await globalSearch(db, content, "سراسری");
    expect(c.sections!.contacts).toBeNull();
    expect(c.sections!.inquiries).toBeNull();
    expect(c.sections!.transactions).toBeNull();
    expect(c.sections!.finance).toBeNull();

    const f = await globalSearch(db, finance, "سراسری");
    expect(f.sections!.properties).toBeNull();
    expect(f.sections!.finance!.total).toBe(1);
  });
});
