import "server-only";
import type { DBorTx } from "@/server/db";
import type { Actor } from "./common";
import { listAdminProperties } from "./properties";
import { listContacts, listInquiries } from "./crm";
import { listFinance, listTransactions } from "./deals";

/**
 * Admin-wide search. Each section reuses the module's own list function, so permissions,
 * agent scoping (own/unassigned records only) and query normalisation stay identical to the module pages.
 * A section the actor may not view is omitted entirely — not returned empty — so nothing leaks its existence.
 */
export const GLOBAL_SEARCH_PREVIEW = 5;

export async function globalSearch(db: DBorTx, actor: Actor, rawQ: unknown) {
  const q = typeof rawQ === "string" ? rawQ.trim().slice(0, 100) : "";
  if (q.length < 2) return { q, sections: null };
  const can = (p: Parameters<Actor["permissions"]["has"]>[0]) => actor.permissions.has(p);
  const params = { q };
  const [properties, contacts, inquiries, transactions, finance] = await Promise.all([
    can("properties.view") ? listAdminProperties(db, actor, params) : null,
    can("contacts.view") ? listContacts(db, actor, params) : null,
    can("inquiries.view") ? listInquiries(db, actor, params) : null,
    can("transactions.view") ? listTransactions(db, actor, params) : null,
    can("finance.view") ? listFinance(db, actor, { ...params, status: "all" }) : null,
  ]);
  const top = <T,>(r: { rows: T[]; total: number } | null) => (r ? { rows: r.rows.slice(0, GLOBAL_SEARCH_PREVIEW), total: r.total } : null);
  return {
    q,
    sections: {
      properties: top(properties),
      contacts: top(contacts),
      inquiries: top(inquiries),
      transactions: top(transactions),
      finance: top(finance),
    },
  };
}
